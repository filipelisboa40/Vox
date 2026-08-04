import { describe, expect, it } from 'vitest';

import { createTrack } from '../models/test-fixtures.js';
import {
    formatDuration,
    formatProgress,
    formatTrackTitle,
    sumKnownDurations,
} from './playback-format.js';

describe('playback formatting', () => {
    it('formats short, long, and unknown durations', () => {
        expect(formatDuration(65_000)).toBe('1:05');
        expect(formatDuration(3_665_000)).toBe('1:01:05');
        expect(formatDuration(null)).toBe('unknown');
    });

    it('clamps progress and handles unknown duration', () => {
        expect(formatProgress(50_000, 100_000, 10)).toBe('━━━━━●────');
        expect(formatProgress(200_000, 100_000, 10)).toBe('━━━━━━━━━●');
        expect(formatProgress(50_000, null, 10)).toBe('──────────');
    });

    it('escapes and truncates external titles', () => {
        const track = { ...createTrack('unsafe'), title: '**external title**' };
        expect(formatTrackTitle(track, 12)).toBe('\\*\\*externa…');
    });

    it('sums only completely known duration sets', () => {
        const known = createTrack('known');
        const unknown = { ...createTrack('unknown'), durationMs: null };
        expect(sumKnownDurations([known, known])).toBe(360_000);
        expect(sumKnownDurations([known, unknown])).toBeNull();
    });
});
