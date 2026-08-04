import type { Logger } from 'pino';

import { LoopMode } from '../models/playback-state.js';
import { QueueManager } from '../models/queue-manager.js';
import { SkipHistory } from '../models/skip-history.js';
import type { Track } from '../models/track.js';
import type { AudioResourceManager } from './audio-resource-manager.js';

export type EnqueueResult =
    | { readonly status: 'started' }
    | { readonly status: 'queued'; readonly position: number }
    | { readonly status: 'failed' };

export type SkipResult =
    | { readonly status: 'nothing-playing' }
    | { readonly status: 'skipped'; readonly skipped: Track; readonly next?: Track };

export type UnskipResult =
    | { readonly status: 'nothing-to-unskip' }
    | { readonly status: 'restored'; readonly track: Track; readonly positionMs: number }
    | { readonly status: 'failed' };

export type SeekResult =
    | { readonly status: 'nothing-playing' }
    | { readonly status: 'unsupported' }
    | { readonly status: 'out-of-range' }
    | { readonly status: 'failed' }
    | { readonly status: 'seeked'; readonly positionMs: number };

export class PlaybackController {
    public readonly queue = new QueueManager();
    public readonly skipHistory = new SkipHistory();
    readonly #audioResources: AudioResourceManager;
    readonly #logger: Logger;
    #isStarting = false;
    #isAdvancing = false;
    #advanceRequested = false;
    #loopMode: LoopMode = LoopMode.Off;

    public constructor(audioResources: AudioResourceManager, logger: Logger) {
        this.#audioResources = audioResources;
        this.#logger = logger;
    }

    public get currentTrack(): Track | undefined {
        return this.#audioResources.currentTrack;
    }

    public get loopMode(): LoopMode {
        return this.#loopMode;
    }

    public get playbackPositionMs(): number {
        return this.#audioResources.playbackPositionMs;
    }

    public get volume(): number {
        return this.#audioResources.volume;
    }

    public setLoopMode(loopMode: LoopMode): void {
        this.#loopMode = loopMode;
    }

    public pause(): boolean {
        return this.#audioResources.pause();
    }

    public resume(): boolean {
        return this.#audioResources.resume();
    }

    public replay(): Promise<SeekResult> {
        return this.seek(0);
    }

    public async seek(positionMs: number): Promise<SeekResult> {
        const track = this.currentTrack;

        if (track === undefined) {
            return { status: 'nothing-playing' };
        }

        if (!Number.isFinite(positionMs) || positionMs < 0) {
            return { status: 'out-of-range' };
        }

        if (track.durationMs !== null && positionMs >= track.durationMs) {
            return { status: 'out-of-range' };
        }

        if (!this.#audioResources.supportsSeeking(track)) {
            return { status: 'unsupported' };
        }

        return (await this.#audioResources.seek(positionMs))
            ? { status: 'seeked', positionMs }
            : { status: 'failed' };
    }

    public seekRelative(amountMs: number): Promise<SeekResult> {
        if (!Number.isFinite(amountMs)) {
            return Promise.resolve({ status: 'out-of-range' });
        }

        return this.seek(Math.max(0, this.playbackPositionMs + amountMs));
    }

    public async skip(): Promise<SkipResult> {
        const skipped = this.currentTrack;

        if (skipped === undefined) {
            return { status: 'nothing-playing' };
        }

        this.skipHistory.push({
            track: skipped,
            positionMs: this.#audioResources.playbackPositionMs,
        });
        await this.#audioResources.stop();
        await this.advance();

        return {
            status: 'skipped',
            skipped,
            ...(this.currentTrack === undefined ? {} : { next: this.currentTrack }),
        };
    }

    public async unskip(): Promise<UnskipResult> {
        const record = this.skipHistory.pop();

        if (record === undefined) {
            return { status: 'nothing-to-unskip' };
        }

        const interrupted = this.currentTrack;
        const restored = await this.#audioResources.play(record.track, {
            startPositionMs: record.positionMs,
        });

        if (!restored) {
            this.skipHistory.push(record);
            return { status: 'failed' };
        }

        if (interrupted !== undefined) {
            this.queue.addFirst(interrupted);
        }

        return { status: 'restored', track: record.track, positionMs: record.positionMs };
    }

    public async enqueue(track: Track): Promise<EnqueueResult> {
        if (this.currentTrack !== undefined || this.#isStarting) {
            const internalIndex = this.queue.add(track);
            return { status: 'queued', position: internalIndex + 1 };
        }

        this.#isStarting = true;

        try {
            const started = await this.#audioResources.play(track);

            if (!started) {
                await this.advance();
                return { status: 'failed' };
            }

            return { status: 'started' };
        } finally {
            this.#isStarting = false;
        }
    }

    public async advance(): Promise<void> {
        if (this.#isAdvancing) {
            this.#advanceRequested = true;
            return;
        }

        this.#isAdvancing = true;

        try {
            do {
                this.#advanceRequested = false;
                const nextTrack = this.queue.takeNext();

                if (nextTrack === undefined) {
                    return;
                }

                const started = await this.#audioResources.play(nextTrack);

                if (started) {
                    return;
                }

                this.#logger.warn(
                    {
                        provider: nextTrack.provider,
                        providerTrackId: nextTrack.providerTrackId,
                    },
                    'Skipped an unplayable queued track',
                );
            } while (this.#advanceRequested || !this.queue.isEmpty);
        } finally {
            this.#isAdvancing = false;

            if (this.#advanceRequested) {
                void this.advance();
            }
        }
    }

    public async stop(): Promise<boolean> {
        const hadPlayback =
            this.currentTrack !== undefined || !this.queue.isEmpty || this.#isStarting;
        this.queue.clearWaiting();
        this.skipHistory.clear();
        this.#loopMode = LoopMode.Off;
        this.#advanceRequested = false;
        await this.#audioResources.stop();
        return hadPlayback;
    }

    public async dispose(): Promise<void> {
        await this.stop();
    }
}
