import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { LoopMode } from '../models/playback-state.js';
import { createTrack } from '../models/test-fixtures.js';
import type { Track } from '../models/track.js';
import type { AudioResourceManager } from './audio-resource-manager.js';
import { PlaybackController } from './playback-controller.js';

interface ResourceFixture {
    readonly resources: AudioResourceManager;
    readonly play: ReturnType<typeof vi.fn>;
    readonly dispose: ReturnType<typeof vi.fn>;
    readonly stop: ReturnType<typeof vi.fn>;
    readonly seek: ReturnType<typeof vi.fn>;
    clearCurrent(): void;
}

function createResourceFixture(results: readonly boolean[] = [true]): ResourceFixture {
    const remainingResults = [...results];
    let currentTrack: Track | undefined;
    const play = vi.fn((track: Track) => {
        const result = remainingResults.shift() ?? true;

        if (result) {
            currentTrack = track;
        }

        return Promise.resolve(result);
    });
    const dispose = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn(() => {
        currentTrack = undefined;
        return Promise.resolve();
    });
    const seek = vi.fn().mockResolvedValue(true);
    const resources = {
        play,
        dispose,
        stop,
        seek,
        supportsSeeking: () => true,
    } as unknown as AudioResourceManager;
    Object.defineProperty(resources, 'currentTrack', { get: () => currentTrack });
    Object.defineProperty(resources, 'playbackPositionMs', { get: () => 42_000 });
    Object.defineProperty(resources, 'volume', { get: () => 1 });

    return {
        resources,
        play,
        dispose,
        stop,
        seek,
        clearCurrent: () => {
            currentTrack = undefined;
        },
    };
}

function createLogger(): Logger {
    return { warn: vi.fn() } as unknown as Logger;
}

describe('PlaybackController', () => {
    it('starts a track immediately while idle', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        const track = createTrack('first');

        await expect(controller.enqueue(track)).resolves.toEqual({ status: 'started' });
        expect(resources.play).toHaveBeenCalledWith(track);
        expect(controller.queue.isEmpty).toBe(true);
    });

    it('queues tracks while another track is active', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        await controller.enqueue(createTrack('current'));

        await expect(controller.enqueue(createTrack('second'))).resolves.toEqual({
            status: 'queued',
            position: 1,
        });
        await expect(controller.enqueue(createTrack('third'))).resolves.toEqual({
            status: 'queued',
            position: 2,
        });
    });

    it('automatically advances to the next waiting track', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        const first = createTrack('first');
        const second = createTrack('second');
        await controller.enqueue(first);
        await controller.enqueue(second);
        resources.clearCurrent();

        await controller.advance();

        expect(resources.play).toHaveBeenLastCalledWith(second);
        expect(controller.currentTrack).toBe(second);
        expect(controller.queue.isEmpty).toBe(true);
    });

    it('restarts a naturally completed track from zero in track-loop mode', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        const track = createTrack('looped');
        await controller.enqueue(track);
        controller.toggleTrackLoop();
        resources.clearCurrent();

        await controller.handleTrackFinished(track);

        expect(resources.play).toHaveBeenLastCalledWith(track, { startPositionMs: 0 });
        expect(controller.currentTrack).toBe(track);
    });

    it('appends completed tracks before advancing in queue-loop mode', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        const first = createTrack('first');
        const second = createTrack('second');
        await controller.enqueue(first);
        await controller.enqueue(second);
        controller.toggleQueueLoop();
        resources.clearCurrent();

        await controller.handleTrackFinished(first);

        expect(controller.currentTrack).toBe(second);
        expect(controller.queue.snapshot()).toEqual([first]);
    });

    it('restarts a single completed track in queue-loop mode', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        const track = createTrack('only');
        await controller.enqueue(track);
        controller.toggleQueueLoop();
        resources.clearCurrent();

        await controller.handleTrackFinished(track);

        expect(controller.currentTrack).toBe(track);
        expect(controller.queue.isEmpty).toBe(true);
    });

    it('manual skip bypasses track-loop repetition for that transition', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        const first = createTrack('first');
        const second = createTrack('second');
        await controller.enqueue(first);
        await controller.enqueue(second);
        controller.toggleTrackLoop();

        await controller.skip();

        expect(controller.currentTrack).toBe(second);
        expect(resources.play).not.toHaveBeenCalledWith(first, { startPositionMs: 0 });
        expect(controller.loopMode).toBe(LoopMode.Track);
    });

    it('advances past errors without adding failed tracks to queue-loop rotation', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        const failed = createTrack('failed');
        const next = createTrack('next');
        await controller.enqueue(failed);
        await controller.enqueue(next);
        controller.toggleQueueLoop();
        resources.clearCurrent();

        await controller.handleTrackFailed();

        expect(controller.currentTrack).toBe(next);
        expect(controller.queue.isEmpty).toBe(true);
    });

    it('keeps track and queue loop modes mutually exclusive while toggling', () => {
        const controller = new PlaybackController(
            createResourceFixture().resources,
            createLogger(),
        );

        expect(controller.toggleTrackLoop()).toBe(LoopMode.Track);
        expect(controller.toggleQueueLoop()).toBe(LoopMode.Queue);
        expect(controller.toggleQueueLoop()).toBe(LoopMode.Off);
        expect(controller.toggleTrackLoop()).toBe(LoopMode.Track);
        expect(controller.toggleTrackLoop()).toBe(LoopMode.Off);
    });

    it('skips an unplayable waiting track and continues', async () => {
        const resources = createResourceFixture([true, false, true]);
        const controller = new PlaybackController(resources.resources, createLogger());
        const first = createTrack('first');
        const broken = createTrack('broken');
        const third = createTrack('third');
        await controller.enqueue(first);
        await controller.enqueue(broken);
        await controller.enqueue(third);
        resources.clearCurrent();

        await controller.advance();

        expect(resources.play).toHaveBeenNthCalledWith(2, broken);
        expect(resources.play).toHaveBeenNthCalledWith(3, third);
        expect(controller.currentTrack).toBe(third);
        expect(controller.queue.isEmpty).toBe(true);
    });

    it('returns a failed result when an idle track cannot start', async () => {
        const resources = createResourceFixture([false]);
        const controller = new PlaybackController(resources.resources, createLogger());

        await expect(controller.enqueue(createTrack('broken'))).resolves.toEqual({
            status: 'failed',
        });
    });

    it('replays and seeks without changing queue or loop state', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        const current = createTrack('current');
        const waiting = createTrack('waiting');
        await controller.enqueue(current);
        await controller.enqueue(waiting);
        controller.setLoopMode(LoopMode.Track);

        await expect(controller.replay()).resolves.toEqual({ status: 'seeked', positionMs: 0 });
        await expect(controller.seek(60_000)).resolves.toEqual({
            status: 'seeked',
            positionMs: 60_000,
        });
        expect(resources.seek).toHaveBeenNthCalledWith(1, 0);
        expect(resources.seek).toHaveBeenNthCalledWith(2, 60_000);
        expect(controller.queue.snapshot()).toEqual([waiting]);
        expect(controller.loopMode).toBe(LoopMode.Track);
    });

    it('clamps backward relative seeks to zero and rejects known duration overflow', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        await controller.enqueue(createTrack('current'));

        await expect(controller.seekRelative(-100_000)).resolves.toEqual({
            status: 'seeked',
            positionMs: 0,
        });
        await expect(controller.seek(180_000)).resolves.toEqual({ status: 'out-of-range' });
    });

    it('reports provider-restricted seeking', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        await controller.enqueue(createTrack('current'));
        vi.spyOn(resources.resources, 'supportsSeeking').mockReturnValue(false);

        await expect(controller.seek(10_000)).resolves.toEqual({ status: 'unsupported' });
    });

    it('skips to the next track and records the playback position', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        const first = createTrack('first');
        const second = createTrack('second');
        await controller.enqueue(first);
        await controller.enqueue(second);

        await expect(controller.skip()).resolves.toEqual({
            status: 'skipped',
            skipped: first,
            next: second,
        });
        expect(controller.skipHistory.peek()).toEqual({ track: first, positionMs: 42_000 });
        expect(resources.stop).toHaveBeenCalledOnce();
        expect(controller.currentTrack).toBe(second);
    });

    it('skips the current track when the queue is empty', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        const track = createTrack('only');
        await controller.enqueue(track);

        await expect(controller.skip()).resolves.toEqual({ status: 'skipped', skipped: track });
        expect(controller.currentTrack).toBeUndefined();
        expect(controller.skipHistory.size).toBe(1);
    });

    it('reports skip while nothing is playing', async () => {
        const controller = new PlaybackController(
            createResourceFixture().resources,
            createLogger(),
        );

        await expect(controller.skip()).resolves.toEqual({ status: 'nothing-playing' });
    });

    it('restores the latest skipped track and returns the interrupted track to the front', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        const first = createTrack('first');
        const second = createTrack('second');
        const third = createTrack('third');
        await controller.enqueue(first);
        await controller.enqueue(second);
        await controller.enqueue(third);
        await controller.skip();

        await expect(controller.unskip()).resolves.toEqual({
            status: 'restored',
            track: first,
            positionMs: 42_000,
        });
        expect(resources.play).toHaveBeenLastCalledWith(first, { startPositionMs: 42_000 });
        expect(controller.currentTrack).toBe(first);
        expect(controller.queue.snapshot()).toEqual([second, third]);
        expect(controller.skipHistory.size).toBe(0);
    });

    it('restores history when an unskip playback attempt fails', async () => {
        const resources = createResourceFixture([true, false]);
        const controller = new PlaybackController(resources.resources, createLogger());
        const current = createTrack('current');
        const skipped = createTrack('skipped');
        await controller.enqueue(current);
        controller.skipHistory.push({ track: skipped, positionMs: 1_000 });

        await expect(controller.unskip()).resolves.toEqual({ status: 'failed' });
        expect(controller.currentTrack).toBe(current);
        expect(controller.queue.isEmpty).toBe(true);
        expect(controller.skipHistory.peek()).toEqual({ track: skipped, positionMs: 1_000 });
    });

    it('reports unskip without history', async () => {
        const controller = new PlaybackController(
            createResourceFixture().resources,
            createLogger(),
        );

        await expect(controller.unskip()).resolves.toEqual({ status: 'nothing-to-unskip' });
    });

    it('stops playback and resets queue, history, and loop state', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        await controller.enqueue(createTrack('current'));
        await controller.enqueue(createTrack('waiting'));
        controller.skipHistory.push({ track: createTrack('skipped'), positionMs: 1_000 });
        controller.setLoopMode(LoopMode.Queue);

        await expect(controller.stop()).resolves.toBe(true);

        expect(controller.queue.isEmpty).toBe(true);
        expect(controller.skipHistory.size).toBe(0);
        expect(controller.loopMode).toBe(LoopMode.Off);
        expect(controller.currentTrack).toBeUndefined();
        expect(resources.stop).toHaveBeenCalledOnce();
    });

    it('reports an already stopped controller', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());

        await expect(controller.stop()).resolves.toBe(false);
        expect(resources.stop).toHaveBeenCalledOnce();
    });

    it('disposes by applying the same complete stop reset', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        await controller.enqueue(createTrack('current'));
        await controller.enqueue(createTrack('waiting'));

        await controller.dispose();

        expect(controller.queue.isEmpty).toBe(true);
        expect(resources.stop).toHaveBeenCalledOnce();
    });
});
