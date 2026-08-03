export interface TrackRequester {
    readonly userId: string;
    readonly displayName: string;
}

export interface Track {
    readonly provider: string;
    readonly providerTrackId: string;
    readonly title: string;
    readonly url: string;
    readonly durationMs: number | null;
    readonly thumbnailUrl?: string;
    readonly requestedBy: TrackRequester;
    readonly startPositionMs?: number;
}
