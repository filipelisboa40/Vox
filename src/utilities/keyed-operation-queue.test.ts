import { describe, expect, it, vi } from 'vitest';

import { KeyedOperationQueue } from './keyed-operation-queue.js';

describe('KeyedOperationQueue', () => {
    it('serializes work for the same guild in arrival order', async () => {
        const queue = new KeyedOperationQueue();
        let releaseFirst: () => void = () => undefined;
        const firstGate = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const events: string[] = [];

        const first = queue.run('guild', async () => {
            events.push('first-start');
            await firstGate;
            events.push('first-end');
        });
        const second = queue.run('guild', () => {
            events.push('second');
            return Promise.resolve();
        });
        await vi.waitFor(() => expect(events).toEqual(['first-start']));
        releaseFirst();
        await Promise.all([first, second]);

        expect(events).toEqual(['first-start', 'first-end', 'second']);
    });

    it('does not let one guild block another guild', async () => {
        const queue = new KeyedOperationQueue();
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const blocked = queue.run('guild-one', () => gate);
        const independent = vi.fn().mockResolvedValue('done');

        await expect(queue.run('guild-two', independent)).resolves.toBe('done');
        expect(independent).toHaveBeenCalledOnce();
        release();
        await blocked;
    });

    it('continues after a failed operation', async () => {
        const queue = new KeyedOperationQueue();
        const failed = queue.run('guild', () => Promise.reject(new Error('failed')));
        const next = queue.run('guild', () => Promise.resolve('recovered'));

        await expect(failed).rejects.toThrow('failed');
        await expect(next).resolves.toBe('recovered');
    });
});
