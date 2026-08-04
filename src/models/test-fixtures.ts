import type { Track } from './track.js';

const genericResponseTitles = new Set(['Success', 'Information', 'Unable to complete command']);

export function recordCommandResponse(
    record: (value: unknown) => void,
): (value: unknown) => Promise<void> {
    return (value) => {
        record(extractGenericResponseDescription(value));
        return Promise.resolve();
    };
}

function extractGenericResponseDescription(value: unknown): unknown {
    if (typeof value !== 'object' || value === null || !('embeds' in value)) return value;
    const embeds = (value as { embeds?: unknown[] }).embeds;
    const first = embeds?.[0];

    if (typeof first !== 'object' || first === null) return value;
    const toJSON = (first as { toJSON?: unknown }).toJSON;
    const serialized: unknown =
        typeof toJSON === 'function' ? (toJSON as (this: unknown) => unknown).call(first) : first;

    if (typeof serialized !== 'object' || serialized === null) return value;
    const response = serialized as Record<string, unknown>;

    if (
        typeof response.title === 'string' &&
        genericResponseTitles.has(response.title) &&
        typeof response.description === 'string'
    ) {
        return response.description;
    }

    return value;
}

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
