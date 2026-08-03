import type { Track } from './track.js';

export function createTrack(id: string): Track {
    return {
        provider: 'test',
        providerTrackId: id,
        title: `Track ${id}`,
        url: `https://example.com/tracks/${id}`,
        durationMs: 180_000,
        requestedBy: {
            userId: 'requester-id',
            displayName: 'Requester',
        },
    };
}
