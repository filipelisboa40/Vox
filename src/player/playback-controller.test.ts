import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { createTrack } from '../models/test-fixtures.js';
import type { Track } from '../models/track.js';
import type { AudioResourceManager } from './audio-resource-manager.js';
import { PlaybackController } from './playback-controller.js';

interface ResourceFixture {
    readonly resources: AudioResourceManager;
    readonly play: ReturnType<typeof vi.fn>;
    readonly dispose: ReturnType<typeof vi.fn>;
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
    const resources = { play, dispose } as unknown as AudioResourceManager;
    Object.defineProperty(resources, 'currentTrack', { get: () => currentTrack });

    return {
        resources,
        play,
        dispose,
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

    it('clears waiting tracks and disposes resources', async () => {
        const resources = createResourceFixture();
        const controller = new PlaybackController(resources.resources, createLogger());
        await controller.enqueue(createTrack('current'));
        await controller.enqueue(createTrack('waiting'));

        await controller.dispose();

        expect(controller.queue.isEmpty).toBe(true);
        expect(resources.dispose).toHaveBeenCalledOnce();
    });
});
