import {
    AudioPlayerStatus,
    StreamType,
    createAudioResource,
    type AudioPlayer,
    type AudioPlayerError,
    type AudioResource,
} from '@discordjs/voice';
import type { Readable } from 'node:stream';
import type { Logger } from 'pino';

import type { Track } from '../models/track.js';
import {
    AudioSourceFormat,
    type PlayableSource,
    type PlayableSourceOptions,
    type ProviderTrack,
} from '../providers/audio-provider.js';

export interface PlayableSourceProvider {
    createPlayableSource(
        track: ProviderTrack,
        options?: PlayableSourceOptions,
    ): Promise<PlayableSource>;
    canSeek?(track: ProviderTrack): boolean;
}

export interface PlayOptions {
    readonly startPositionMs?: number;
}

export interface AudioResourceManagerOptions {
    readonly audioPlayer: AudioPlayer;
    readonly provider: PlayableSourceProvider;
    readonly logger: Logger;
    readonly resourceFactory?: AudioResourceFactory;
    readonly onTrackFinished?: (track: Track) => void | Promise<void>;
    readonly onTrackFailed?: (track: Track, error: unknown) => void | Promise<void>;
}

export type AudioResourceFactory = (
    stream: Readable,
    options: {
        readonly inputType: StreamType;
        readonly inlineVolume: false;
        readonly metadata: Track;
    },
) => AudioResource<Track>;

interface ManagedResource {
    readonly track: Track;
    readonly source: PlayableSource;
    readonly resource: AudioResource<Track>;
    readonly startPositionMs: number;
    disposed: boolean;
}

export class AudioResourceManager {
    readonly #audioPlayer: AudioPlayer;
    readonly #provider: PlayableSourceProvider;
    readonly #logger: Logger;
    readonly #resourceFactory: AudioResourceFactory;
    readonly #onTrackFinished: ((track: Track) => void | Promise<void>) | undefined;
    readonly #onTrackFailed: ((track: Track, error: unknown) => void | Promise<void>) | undefined;
    #current: ManagedResource | undefined;
    #requestGeneration = 0;
    #pauseWhenPlaying = false;

    public constructor(options: AudioResourceManagerOptions) {
        this.#audioPlayer = options.audioPlayer;
        this.#provider = options.provider;
        this.#logger = options.logger;
        this.#resourceFactory = options.resourceFactory ?? createAudioResource;
        this.#onTrackFinished = options.onTrackFinished;
        this.#onTrackFailed = options.onTrackFailed;
        this.#registerPlayerHandlers();
    }

    public get currentTrack(): Track | undefined {
        return this.#current?.track;
    }

    public get playbackPositionMs(): number {
        return this.#current === undefined
            ? 0
            : this.#current.startPositionMs + this.#current.resource.playbackDuration;
    }

    public pause(): boolean {
        if (
            this.#current === undefined ||
            this.#audioPlayer.state.status !== AudioPlayerStatus.Playing
        ) {
            return false;
        }

        return this.#audioPlayer.pause();
    }

    public resume(): boolean {
        if (
            this.#current === undefined ||
            this.#audioPlayer.state.status !== AudioPlayerStatus.Paused
        ) {
            return false;
        }

        return this.#audioPlayer.unpause();
    }

    public supportsSeeking(track: Track): boolean {
        return this.#provider.canSeek?.(toProviderTrack(track)) === true;
    }

    public async seek(positionMs: number): Promise<boolean> {
        const track = this.currentTrack;

        if (track === undefined || !this.supportsSeeking(track)) {
            return false;
        }

        const wasPaused = this.#audioPlayer.state.status === AudioPlayerStatus.Paused;
        const started = await this.play(track, { startPositionMs: positionMs });

        if (started && wasPaused) {
            this.#pauseWhenPlaying = !this.#audioPlayer.pause();
        }

        return started;
    }

    public async play(track: Track, options: PlayOptions = {}): Promise<boolean> {
        const requestGeneration = ++this.#requestGeneration;
        let source: PlayableSource;

        try {
            source = await this.#provider.createPlayableSource(toProviderTrack(track), {
                ...((options.startPositionMs ?? track.startPositionMs) === undefined
                    ? {}
                    : { startPositionMs: options.startPositionMs ?? track.startPositionMs }),
            });
        } catch (error: unknown) {
            await this.#notifyFailure(track, error);
            return false;
        }

        if (requestGeneration !== this.#requestGeneration) {
            await disposeSource(source);
            return false;
        }

        let managedResource: ManagedResource;

        try {
            const resource = this.#resourceFactory(source.stream, {
                inputType: toDiscordStreamType(source.format),
                inlineVolume: false,
                metadata: track,
            });
            managedResource = {
                track,
                source,
                resource,
                startPositionMs: options.startPositionMs ?? track.startPositionMs ?? 0,
                disposed: false,
            };
        } catch (error: unknown) {
            await disposeSource(source);
            await this.#notifyFailure(track, error);
            return false;
        }

        const previousResource = this.#current;
        this.#current = managedResource;

        try {
            this.#audioPlayer.play(managedResource.resource);
        } catch (error: unknown) {
            this.#current = previousResource;
            await this.#disposeManagedResource(managedResource);
            await this.#notifyFailure(track, error);
            return false;
        }

        await this.#disposeManagedResource(previousResource);
        return true;
    }

    public async stop(): Promise<void> {
        this.#requestGeneration += 1;
        this.#pauseWhenPlaying = false;
        const current = this.#current;
        this.#current = undefined;
        this.#audioPlayer.stop(true);
        await this.#disposeManagedResource(current);
    }

    public async dispose(): Promise<void> {
        await this.stop();
    }

    #registerPlayerHandlers(): void {
        this.#audioPlayer.on(AudioPlayerStatus.Playing, () => {
            if (this.#pauseWhenPlaying) {
                this.#pauseWhenPlaying = false;
                this.#audioPlayer.pause();
            }
        });

        this.#audioPlayer.on(AudioPlayerStatus.Idle, (oldState) => {
            const completed = this.#current;

            if (
                completed === undefined ||
                oldState.status === AudioPlayerStatus.Idle ||
                oldState.resource !== completed.resource
            ) {
                this.#logger.debug('Ignored an idle event from a replaced audio resource');
                return;
            }

            this.#current = undefined;
            void this.#disposeManagedResource(completed).then(() =>
                this.#runCallback(this.#onTrackFinished, completed.track),
            );
        });

        this.#audioPlayer.on('error', (error: AudioPlayerError) => {
            const failed = this.#current;

            if (failed === undefined || error.resource !== failed.resource) {
                this.#logger.debug('Ignored an error from a replaced audio resource');
                return;
            }

            this.#current = undefined;
            void this.#disposeManagedResource(failed).then(() =>
                this.#notifyFailure(failed.track, error),
            );
        });
    }

    async #disposeManagedResource(managedResource: ManagedResource | undefined): Promise<void> {
        if (managedResource === undefined || managedResource.disposed) {
            return;
        }

        managedResource.disposed = true;

        try {
            await disposeSource(managedResource.source);
        } catch (error: unknown) {
            this.#logger.warn({ err: error }, 'Audio source cleanup failed');
        }
    }

    async #notifyFailure(track: Track, error: unknown): Promise<void> {
        this.#logger.error(
            { err: error, provider: track.provider, providerTrackId: track.providerTrackId },
            'Track playback failed',
        );
        await this.#runCallback(this.#onTrackFailed, track, error);
    }

    async #runCallback<Arguments extends readonly unknown[]>(
        callback: ((...arguments_: Arguments) => void | Promise<void>) | undefined,
        ...arguments_: Arguments
    ): Promise<void> {
        try {
            await callback?.(...arguments_);
        } catch (error: unknown) {
            this.#logger.error({ err: error }, 'Audio resource callback failed');
        }
    }
}

export function toDiscordStreamType(format: AudioSourceFormat): StreamType {
    switch (format) {
        case AudioSourceFormat.Opus:
            return StreamType.Opus;
        case AudioSourceFormat.OggOpus:
            return StreamType.OggOpus;
        case AudioSourceFormat.WebmOpus:
            return StreamType.WebmOpus;
        case AudioSourceFormat.Unknown:
            return StreamType.Arbitrary;
    }
}

function toProviderTrack(track: Track): ProviderTrack {
    return {
        provider: track.provider,
        providerTrackId: track.providerTrackId,
        title: track.title,
        url: track.url,
        durationMs: track.durationMs,
        ...(track.thumbnailUrl === undefined ? {} : { thumbnailUrl: track.thumbnailUrl }),
    };
}

async function disposeSource(source: PlayableSource): Promise<void> {
    source.stream.destroy();
    await source.dispose?.();
}
