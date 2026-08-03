import type { Readable } from 'node:stream';

export interface ProviderTrack {
    readonly provider: string;
    readonly providerTrackId: string;
    readonly title: string;
    readonly url: string;
    readonly durationMs: number | null;
    readonly thumbnailUrl?: string;
}

export const AudioSourceFormat = {
    Unknown: 'unknown',
    Opus: 'opus',
    OggOpus: 'ogg-opus',
    WebmOpus: 'webm-opus',
} as const;

export type AudioSourceFormat = (typeof AudioSourceFormat)[keyof typeof AudioSourceFormat];

export interface PlayableSource {
    readonly stream: Readable;
    readonly format: AudioSourceFormat;
}

export interface PlayableSourceOptions {
    readonly startPositionMs?: number;
}

export interface AudioProvider {
    readonly name: string;
    canHandleUrl(url: URL): boolean;
    search(query: string): Promise<ProviderTrack>;
    resolveUrl(url: URL): Promise<ProviderTrack>;
    createPlayableSource(
        track: ProviderTrack,
        options?: PlayableSourceOptions,
    ): Promise<PlayableSource>;
}
