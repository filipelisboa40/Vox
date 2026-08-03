import { describe, expect, it } from 'vitest';

import { SkipHistory } from './skip-history.js';
import { createTrack } from './test-fixtures.js';

describe('SkipHistory', () => {
    it('returns the most recent skip first', () => {
        const history = new SkipHistory();
        const first = { track: createTrack('first'), positionMs: 10_000 };
        const second = { track: createTrack('second'), positionMs: 20_000 };

        history.push(first);
        history.push(second);

        expect(history.peek()).toBe(second);
        expect(history.pop()).toBe(second);
        expect(history.pop()).toBe(first);
        expect(history.pop()).toBeUndefined();
    });

    it('discards the oldest entries beyond its capacity', () => {
        const history = new SkipHistory(2);
        history.push({ track: createTrack('first'), positionMs: 0 });
        history.push({ track: createTrack('second'), positionMs: 1 });
        history.push({ track: createTrack('third'), positionMs: 2 });

        expect(history.snapshot().map((record) => record.track.providerTrackId)).toEqual([
            'second',
            'third',
        ]);
    });

    it('clears and returns all records', () => {
        const history = new SkipHistory();
        const record = { track: createTrack('track'), positionMs: 5_000 };
        history.push(record);

        expect(history.clear()).toEqual([record]);
        expect(history.size).toBe(0);
    });

    it.each([0, -1, 1.5])('rejects an invalid capacity: %s', (capacity) => {
        expect(() => new SkipHistory(capacity)).toThrow(RangeError);
    });

    it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
        'rejects an invalid playback position: %s',
        (positionMs) => {
            const history = new SkipHistory();

            expect(() => history.push({ track: createTrack('track'), positionMs })).toThrow(
                RangeError,
            );
        },
    );
});
