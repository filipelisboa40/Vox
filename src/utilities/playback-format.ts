import type { Track } from '../models/track.js';
import { escapeDiscordFormatting } from './external-text.js';

export function formatDuration(durationMs: number | null): string {
    if (durationMs === null) return 'unknown';

    const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
    const hours = Math.floor(totalSeconds / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;

    return hours > 0
        ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatTrackTitle(track: Track, maximumLength = 100): string {
    const escaped = escapeDiscordFormatting(track.title);
    return escaped.length <= maximumLength
        ? escaped
        : `${escaped.slice(0, Math.max(0, maximumLength - 1))}…`;
}

export function formatProgress(positionMs: number, durationMs: number | null, width = 16): string {
    if (durationMs === null || durationMs <= 0) return '─'.repeat(width);

    const ratio = Math.min(1, Math.max(0, positionMs / durationMs));
    const markerIndex = Math.min(width - 1, Math.floor(ratio * width));
    return `${'━'.repeat(markerIndex)}●${'─'.repeat(width - markerIndex - 1)}`;
}

export function sumKnownDurations(tracks: readonly Track[]): number | null {
    let total = 0;

    for (const track of tracks) {
        if (track.durationMs === null) return null;
        total += track.durationMs;
    }

    return total;
}
