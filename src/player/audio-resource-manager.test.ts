import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

import {
    AudioPlayerStatus,
    StreamType,
    type AudioPlayer,
    type AudioResource,
} from '@discordjs/voice';
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { createTrack } from '../models/test-fixtures.js';
import type { Track } from '../models/track.js';
import {
    AudioSourceFormat,
    type PlayableSource,
    type ProviderTrack,
} from '../providers/audio-provider.js';
import {
    AudioResourceManager,
    toDiscordStreamType,
    type AudioResourceFactory,
    type PlayableSourceProvider,
} from './audio-resource-manager.js';

interface AudioPlayerFixture {
    readonly audioPlayer: AudioPlayer;
    readonly emitter: EventEmitter;
    readonly play: ReturnType<typeof vi.fn>;
    readonly stop: ReturnType<typeof vi.fn>;
    readonly pause: ReturnType<typeof vi.fn>;
    readonly unpause: ReturnType<typeof vi.fn>;
    setStatus(status: AudioPlayerStatus): void;
}

function createAudioPlayerFixture(): AudioPlayerFixture {
    const emitter = new EventEmitter();
    let status: AudioPlayerStatus = AudioPlayerStatus.Idle;
    const play = vi.fn();
    const stop = vi.fn();
    const pause = vi.fn(() => {
        if (status !== AudioPlayerStatus.Playing) {
            return false;
        }

        status = AudioPlayerStatus.Paused;
        return true;
    });
    const unpause = vi.fn(() => {
        if (status !== AudioPlayerStatus.Paused) {
            return false;
        }

        status = AudioPlayerStatus.Playing;
        return true;
    });
    const audioPlayer = Object.assign(emitter, { play, stop, pause, unpause });
    Object.defineProperty(audioPlayer, 'state', { get: () => ({ status }) });

    return {
        audioPlayer: audioPlayer as unknown as AudioPlayer,
        emitter,
        play,
        stop,
        pause,
        unpause,
        setStatus: (newStatus) => {
            status = newStatus;
        },
    };
}

interface SourceFixture {
    readonly source: PlayableSource;
    readonly stream: Readable;
    readonly dispose: ReturnType<typeof vi.fn>;
}

function createSource(format: AudioSourceFormat = AudioSourceFormat.Unknown): SourceFixture {
    const stream = new Readable({ read: () => undefined });
    const dispose = vi.fn().mockResolvedValue(undefined);
    return { source: { stream, format, dispose }, stream, dispose };
}

interface ResourceFixture {
    readonly factory: AudioResourceFactory;
    readonly resources: AudioResource<Track>[];
    readonly setVolume: ReturnType<typeof vi.fn>;
    readonly receivedInputTypes: StreamType[];
}

function createResourceFixture(): ResourceFixture {
    const resources: AudioResource<Track>[] = [];
    const setVolume = vi.fn();
    const receivedInputTypes: StreamType[] = [];
    const factory: AudioResourceFactory = (_stream, options) => {
        receivedInputTypes.push(options.inputType);
        const resource = {
            metadata: options.metadata,
            volume: { setVolume },
        } as unknown as AudioResource<Track>;
        resources.push(resource);
        return resource;
    };

    return { factory, resources, setVolume, receivedInputTypes };
}

function createProvider(sources: readonly PlayableSource[]): {
    readonly provider: PlayableSourceProvider;
    readonly requestedTracks: ProviderTrack[];
    readonly requestedPositions: Array<number | undefined>;
} {
    const remainingSources = [...sources];
    const requestedTracks: ProviderTrack[] = [];
    const requestedPositions: Array<number | undefined> = [];
    const provider: PlayableSourceProvider = {
        createPlayableSource: (track, options) => {
            requestedTracks.push(track);
            requestedPositions.push(options?.startPositionMs);
            const source = remainingSources.shift();
            return source === undefined
                ? Promise.reject(new Error('No source configured'))
                : Promise.resolve(source);
        },
    };

    return { provider, requestedTracks, requestedPositions };
}

function createLogger(): Logger {
    return {
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    } as unknown as Logger;
}

describe('AudioResourceManager', () => {
    it('pauses only while playing and resumes only while paused', async () => {
        const player = createAudioPlayerFixture();
        const source = createSource();
        const manager = new AudioResourceManager({
            audioPlayer: player.audioPlayer,
            provider: createProvider([source.source]).provider,
            logger: createLogger(),
            resourceFactory: createResourceFixture().factory,
        });
        await manager.play(createTrack('song'));
        player.setStatus(AudioPlayerStatus.Playing);

        expect(manager.pause()).toBe(true);
        expect(manager.pause()).toBe(false);
        expect(manager.resume()).toBe(true);
        expect(manager.resume()).toBe(false);
        expect(player.pause).toHaveBeenCalledOnce();
        expect(player.unpause).toHaveBeenCalledOnce();
    });

    it('does not pause or resume without a current resource', () => {
        const player = createAudioPlayerFixture();
        player.setStatus(AudioPlayerStatus.Playing);
        const manager = new AudioResourceManager({
            audioPlayer: player.audioPlayer,
            provider: createProvider([]).provider,
            logger: createLogger(),
            resourceFactory: createResourceFixture().factory,
        });

        expect(manager.pause()).toBe(false);
        player.setStatus(AudioPlayerStatus.Paused);
        expect(manager.resume()).toBe(false);
    });

    it('creates and plays an inline-volume resource with a requested offset', async () => {
        const player = createAudioPlayerFixture();
        const source = createSource(AudioSourceFormat.WebmOpus);
        const provider = createProvider([source.source]);
        const resources = createResourceFixture();
        const manager = new AudioResourceManager({
            audioPlayer: player.audioPlayer,
            provider: provider.provider,
            logger: createLogger(),
            resourceFactory: resources.factory,
        });

        await expect(
            manager.play(createTrack('song'), { startPositionMs: 15_000, volume: 0.5 }),
        ).resolves.toBe(true);

        expect(provider.requestedPositions).toEqual([15_000]);
        expect(resources.receivedInputTypes).toEqual([StreamType.WebmOpus]);
        expect(resources.setVolume).toHaveBeenCalledWith(0.5);
        expect(player.play).toHaveBeenCalledWith(resources.resources[0]);
    });

    it('disposes the previous source after replacement', async () => {
        const player = createAudioPlayerFixture();
        const firstSource = createSource();
        const secondSource = createSource();
        const resources = createResourceFixture();
        const manager = new AudioResourceManager({
            audioPlayer: player.audioPlayer,
            provider: createProvider([firstSource.source, secondSource.source]).provider,
            logger: createLogger(),
            resourceFactory: resources.factory,
        });

        await manager.play(createTrack('first'));
        await manager.play(createTrack('second'));

        expect(firstSource.stream.destroyed).toBe(true);
        expect(firstSource.dispose).toHaveBeenCalledOnce();
        expect(secondSource.stream.destroyed).toBe(false);
        expect(manager.currentTrack?.providerTrackId).toBe('second');
    });

    it('cleans up and reports natural completion', async () => {
        const player = createAudioPlayerFixture();
        const source = createSource();
        const resources = createResourceFixture();
        const onTrackFinished = vi.fn().mockResolvedValue(undefined);
        const manager = new AudioResourceManager({
            audioPlayer: player.audioPlayer,
            provider: createProvider([source.source]).provider,
            logger: createLogger(),
            resourceFactory: resources.factory,
            onTrackFinished,
        });
        const track = createTrack('finished');
        await manager.play(track);

        player.emitter.emit(AudioPlayerStatus.Idle, {
            status: AudioPlayerStatus.Playing,
            resource: resources.resources[0],
        });
        await vi.waitFor(() => expect(onTrackFinished).toHaveBeenCalledWith(track));

        expect(source.stream.destroyed).toBe(true);
        expect(source.dispose).toHaveBeenCalledOnce();
        expect(manager.currentTrack).toBeUndefined();
    });

    it('cleans up the current source after a player error', async () => {
        const player = createAudioPlayerFixture();
        const source = createSource();
        const resources = createResourceFixture();
        const onTrackFailed = vi.fn().mockResolvedValue(undefined);
        const manager = new AudioResourceManager({
            audioPlayer: player.audioPlayer,
            provider: createProvider([source.source]).provider,
            logger: createLogger(),
            resourceFactory: resources.factory,
            onTrackFailed,
        });
        const track = createTrack('failed');
        await manager.play(track);

        player.emitter.emit('error', {
            resource: resources.resources[0],
            message: 'audio failed',
        });
        await vi.waitFor(() =>
            expect(onTrackFailed).toHaveBeenCalledWith(track, expect.anything()),
        );

        expect(source.stream.destroyed).toBe(true);
        expect(manager.currentTrack).toBeUndefined();
    });

    it('ignores stale errors from a replaced resource', async () => {
        const player = createAudioPlayerFixture();
        const firstSource = createSource();
        const secondSource = createSource();
        const resources = createResourceFixture();
        const onTrackFailed = vi.fn();
        const manager = new AudioResourceManager({
            audioPlayer: player.audioPlayer,
            provider: createProvider([firstSource.source, secondSource.source]).provider,
            logger: createLogger(),
            resourceFactory: resources.factory,
            onTrackFailed,
        });
        await manager.play(createTrack('first'));
        await manager.play(createTrack('second'));

        player.emitter.emit('error', { resource: resources.resources[0] });
        await Promise.resolve();

        expect(onTrackFailed).not.toHaveBeenCalled();
        expect(manager.currentTrack?.providerTrackId).toBe('second');
        expect(secondSource.stream.destroyed).toBe(false);
    });

    it('ignores stale idle events from a replaced resource', async () => {
        const player = createAudioPlayerFixture();
        const firstSource = createSource();
        const secondSource = createSource();
        const resources = createResourceFixture();
        const onTrackFinished = vi.fn();
        const manager = new AudioResourceManager({
            audioPlayer: player.audioPlayer,
            provider: createProvider([firstSource.source, secondSource.source]).provider,
            logger: createLogger(),
            resourceFactory: resources.factory,
            onTrackFinished,
        });
        await manager.play(createTrack('first'));
        await manager.play(createTrack('second'));

        player.emitter.emit(AudioPlayerStatus.Idle, {
            status: AudioPlayerStatus.Playing,
            resource: resources.resources[0],
        });
        await Promise.resolve();

        expect(onTrackFinished).not.toHaveBeenCalled();
        expect(manager.currentTrack?.providerTrackId).toBe('second');
        expect(secondSource.stream.destroyed).toBe(false);
    });

    it('reports an unplayable source without stopping the audio player', async () => {
        const player = createAudioPlayerFixture();
        const failure = new Error('provider failed');
        const onTrackFailed = vi.fn().mockResolvedValue(undefined);
        const provider: PlayableSourceProvider = {
            createPlayableSource: () => Promise.reject(failure),
        };
        const manager = new AudioResourceManager({
            audioPlayer: player.audioPlayer,
            provider,
            logger: createLogger(),
            resourceFactory: createResourceFixture().factory,
            onTrackFailed,
        });
        const track = createTrack('unplayable');

        await expect(manager.play(track)).resolves.toBe(false);
        expect(onTrackFailed).toHaveBeenCalledWith(track, failure);
        expect(player.stop).not.toHaveBeenCalled();
    });

    it('stops and disposes the current source exactly once', async () => {
        const player = createAudioPlayerFixture();
        const source = createSource();
        const manager = new AudioResourceManager({
            audioPlayer: player.audioPlayer,
            provider: createProvider([source.source]).provider,
            logger: createLogger(),
            resourceFactory: createResourceFixture().factory,
        });
        await manager.play(createTrack('current'));

        await manager.stop();
        await manager.dispose();

        expect(player.stop).toHaveBeenCalledTimes(2);
        expect(source.dispose).toHaveBeenCalledOnce();
        expect(source.stream.destroyed).toBe(true);
    });

    it('ignores the idle event emitted after an explicit stop', async () => {
        const player = createAudioPlayerFixture();
        const source = createSource();
        const resources = createResourceFixture();
        const onTrackFinished = vi.fn();
        const manager = new AudioResourceManager({
            audioPlayer: player.audioPlayer,
            provider: createProvider([source.source]).provider,
            logger: createLogger(),
            resourceFactory: resources.factory,
            onTrackFinished,
        });
        await manager.play(createTrack('stopped'));
        await manager.stop();

        player.emitter.emit(AudioPlayerStatus.Idle, {
            status: AudioPlayerStatus.Playing,
            resource: resources.resources[0],
        });
        await Promise.resolve();

        expect(onTrackFinished).not.toHaveBeenCalled();
        expect(source.dispose).toHaveBeenCalledOnce();
    });

    it('rejects invalid volume and disposes the new source', async () => {
        const player = createAudioPlayerFixture();
        const source = createSource();
        const onTrackFailed = vi.fn().mockResolvedValue(undefined);
        const manager = new AudioResourceManager({
            audioPlayer: player.audioPlayer,
            provider: createProvider([source.source]).provider,
            logger: createLogger(),
            resourceFactory: createResourceFixture().factory,
            onTrackFailed,
        });

        await expect(manager.play(createTrack('track'), { volume: 2 })).resolves.toBe(false);
        expect(source.stream.destroyed).toBe(true);
        expect(onTrackFailed).toHaveBeenCalledOnce();
    });
});

describe('toDiscordStreamType', () => {
    it.each([
        [AudioSourceFormat.Unknown, StreamType.Arbitrary],
        [AudioSourceFormat.Opus, StreamType.Opus],
        [AudioSourceFormat.OggOpus, StreamType.OggOpus],
        [AudioSourceFormat.WebmOpus, StreamType.WebmOpus],
    ])('maps %s sources', (format, expected) => {
        expect(toDiscordStreamType(format)).toBe(expected);
    });
});
