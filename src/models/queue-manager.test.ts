import { describe, expect, it, vi } from 'vitest';

import { QueueManager } from './queue-manager.js';
import { createTrack } from './test-fixtures.js';

describe('QueueManager', () => {
    it('starts empty', () => {
        const queue = new QueueManager();

        expect(queue.size).toBe(0);
        expect(queue.isEmpty).toBe(true);
        expect(queue.peek()).toBeUndefined();
        expect(queue.takeNext()).toBeUndefined();
    });

    it('adds tracks and returns their zero-based indexes', () => {
        const queue = new QueueManager();
        const first = createTrack('first');
        const second = createTrack('second');

        expect(queue.add(first)).toBe(0);
        expect(queue.add(second)).toBe(1);
        expect(queue.peek()).toBe(first);
        expect(queue.snapshot()).toEqual([first, second]);
    });

    it('takes waiting tracks in insertion order', () => {
        const queue = new QueueManager();
        const first = createTrack('first');
        const second = createTrack('second');
        queue.add(first);
        queue.add(second);

        expect(queue.takeNext()).toBe(first);
        expect(queue.takeNext()).toBe(second);
        expect(queue.isEmpty).toBe(true);
    });

    it('adds a track to the front of the queue', () => {
        const queue = new QueueManager();
        const first = createTrack('first');
        const urgent = createTrack('urgent');
        queue.add(first);

        queue.addFirst(urgent);

        expect(queue.snapshot()).toEqual([urgent, first]);
    });

    it('removes a selected waiting track', () => {
        const queue = new QueueManager();
        const tracks = [createTrack('a'), createTrack('b'), createTrack('c')];
        tracks.forEach((track) => queue.add(track));

        expect(queue.remove(1)).toBe(tracks[1]);
        expect(queue.snapshot()).toEqual([tracks[0], tracks[2]]);
    });

    it('removes one-based first and last positions', () => {
        const queue = new QueueManager();
        const tracks = [createTrack('a'), createTrack('b'), createTrack('c')];
        tracks.forEach((track) => queue.add(track));

        expect(queue.removePosition(1)).toEqual({ status: 'removed', track: tracks[0] });
        expect(queue.removePosition(2)).toEqual({ status: 'removed', track: tracks[2] });
        expect(queue.snapshot()).toEqual([tracks[1]]);
    });

    it('reports empty and invalid one-based removals without mutation', () => {
        const queue = new QueueManager();
        expect(queue.removePosition(1)).toEqual({ status: 'empty' });
        const track = createTrack('only');
        queue.add(track);
        expect(queue.removePosition(0)).toEqual({ status: 'out-of-range' });
        expect(queue.removePosition(2)).toEqual({ status: 'out-of-range' });
        expect(queue.snapshot()).toEqual([track]);
    });

    it.each([-1, 1, 1.5])('does not remove an invalid index: %s', (index) => {
        const queue = new QueueManager();
        queue.add(createTrack('only'));

        expect(queue.remove(index)).toBeUndefined();
        expect(queue.size).toBe(1);
    });

    it('moves tracks in both directions', () => {
        const queue = new QueueManager();
        const tracks = [createTrack('a'), createTrack('b'), createTrack('c')];
        tracks.forEach((track) => queue.add(track));

        expect(queue.move(0, 2)).toBe(true);
        expect(queue.snapshot()).toEqual([tracks[1], tracks[2], tracks[0]]);
        expect(queue.move(2, 0)).toBe(true);
        expect(queue.snapshot()).toEqual(tracks);
    });

    it('moves one-based positions in both directions and reports equal positions', () => {
        const queue = new QueueManager();
        const tracks = [createTrack('a'), createTrack('b'), createTrack('c')];
        tracks.forEach((track) => queue.add(track));

        expect(queue.movePosition(1, 3)).toEqual({ status: 'moved', track: tracks[0] });
        expect(queue.snapshot()).toEqual([tracks[1], tracks[2], tracks[0]]);
        expect(queue.movePosition(3, 1)).toEqual({ status: 'moved', track: tracks[0] });
        expect(queue.movePosition(2, 2)).toEqual({ status: 'unchanged', track: tracks[1] });
        expect(queue.snapshot()).toEqual(tracks);
    });

    it('reports empty and invalid one-based moves without mutation', () => {
        const queue = new QueueManager();
        expect(queue.movePosition(1, 1)).toEqual({ status: 'empty' });
        const track = createTrack('only');
        queue.add(track);
        expect(queue.movePosition(0, 1)).toEqual({ status: 'out-of-range' });
        expect(queue.movePosition(1, 2)).toEqual({ status: 'out-of-range' });
        expect(queue.snapshot()).toEqual([track]);
    });

    it('leaves the queue unchanged for invalid moves', () => {
        const queue = new QueueManager();
        const track = createTrack('only');
        queue.add(track);

        expect(queue.move(0, 2)).toBe(false);
        expect(queue.move(-1, 0)).toBe(false);
        expect(queue.snapshot()).toEqual([track]);
    });

    it('clears and returns every waiting track', () => {
        const queue = new QueueManager();
        const tracks = [createTrack('a'), createTrack('b')];
        tracks.forEach((track) => queue.add(track));

        expect(queue.clearWaiting()).toEqual(tracks);
        expect(queue.isEmpty).toBe(true);
    });

    it('uses deterministic Fisher-Yates swaps and preserves every track exactly once', () => {
        const randomValues = [0, 0.5, 0.99];
        const queue = new QueueManager(() => randomValues.shift() ?? 0);
        const tracks = [createTrack('a'), createTrack('b'), createTrack('c'), createTrack('d')];
        tracks.forEach((track) => queue.add(track));

        expect(queue.shuffle()).toBe(true);

        expect(queue.snapshot()).toEqual([tracks[3], tracks[2], tracks[1], tracks[0]]);
        expect(new Set(queue.snapshot())).toEqual(new Set(tracks));
        expect(queue.size).toBe(tracks.length);
    });

    it('leaves zero- and one-track queues unchanged without consuming randomness', () => {
        const random = vi.fn().mockReturnValue(0);
        const queue = new QueueManager(random);
        expect(queue.shuffle()).toBe(false);
        const track = createTrack('only');
        queue.add(track);
        expect(queue.shuffle()).toBe(false);
        expect(queue.snapshot()).toEqual([track]);
        expect(random).not.toHaveBeenCalled();
    });

    it('rejects invalid injected random values without losing tracks', () => {
        const queue = new QueueManager(() => 1);
        const tracks = [createTrack('a'), createTrack('b')];
        tracks.forEach((track) => queue.add(track));

        expect(() => queue.shuffle()).toThrow(RangeError);
        expect(queue.snapshot()).toEqual(tracks);
    });

    it('returns snapshots that cannot mutate the queue', () => {
        const queue = new QueueManager();
        queue.add(createTrack('original'));
        const snapshot = queue.snapshot() as TrackForMutation[];

        snapshot.push(createTrack('external'));

        expect(queue.size).toBe(1);
    });

    it('keeps independent queue instances isolated', () => {
        const firstGuildQueue = new QueueManager();
        const secondGuildQueue = new QueueManager();
        firstGuildQueue.add(createTrack('first-guild'));

        expect(firstGuildQueue.size).toBe(1);
        expect(secondGuildQueue.size).toBe(0);
    });
});

type TrackForMutation = ReturnType<typeof createTrack>;
