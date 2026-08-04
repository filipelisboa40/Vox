import { describe, expect, it } from 'vitest';

import { InvalidSeekPositionError, parseSeekPosition } from './seek-position.js';

describe('parseSeekPosition', () => {
    it.each([
        ['75', 75_000],
        ['01:15', 75_000],
        ['1:02:03', 3_723_000],
        [' 00:00 ', 0],
    ])('parses %s', (input, expected) => {
        expect(parseSeekPosition(input)).toBe(expected);
    });

    it.each(['', '-1', '1.5', '1:60', '60:00', '1:2:60', '1:2:3:4', 'abc'])(
        'rejects %s',
        (input) => {
            expect(() => parseSeekPosition(input)).toThrow(InvalidSeekPositionError);
        },
    );
});
