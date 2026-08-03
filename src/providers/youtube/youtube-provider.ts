import { z } from 'zod';

import type { AudioProvider, PlayableSource, ProviderTrack } from '../audio-provider.js';
import {
    MediaStreamError,
    MediaUnavailableError,
    NoMediaResultsError,
    ProviderOperationError,
    UnsupportedMediaUrlError,
} from '../provider-errors.js';
import { normalizeExternalText } from '../../utilities/external-text.js';

const youtubeApiBaseUrl = 'https://www.googleapis.com/youtube/v3/';
const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const defaultMaximumDurationMs = 12 * 60 * 60 * 1_000;

const searchResponseSchema = z.object({
    items: z.array(
        z.object({
            id: z.object({ videoId: z.string().optional() }),
        }),
    ),
});

const thumbnailSchema = z.object({ url: z.string().url() });
const videoResponseSchema = z.object({
    items: z.array(
        z.object({
            id: z.string(),
            snippet: z.object({
                title: z.string(),
                liveBroadcastContent: z.string().optional(),
                thumbnails: z.object({
                    default: thumbnailSchema.optional(),
                    medium: thumbnailSchema.optional(),
                    high: thumbnailSchema.optional(),
                    standard: thumbnailSchema.optional(),
                    maxres: thumbnailSchema.optional(),
                }),
            }),
            contentDetails: z.object({
                duration: z.string(),
                contentRating: z.object({ ytRating: z.string().optional() }).optional(),
                regionRestriction: z
                    .object({
                        allowed: z.array(z.string()).optional(),
                        blocked: z.array(z.string()).optional(),
                    })
                    .optional(),
            }),
            status: z.object({
                privacyStatus: z.string(),
                uploadStatus: z.string(),
            }),
        }),
    ),
});

export interface YouTubeProviderOptions {
    readonly apiKey: string;
    readonly region?: string;
    readonly maximumDurationMs?: number;
    readonly fetchImplementation?: typeof fetch;
}

export class YouTubeProvider implements AudioProvider {
    public readonly name = 'youtube';
    readonly #apiKey: string;
    readonly #region: string | undefined;
    readonly #maximumDurationMs: number;
    readonly #fetch: typeof fetch;

    public constructor(options: YouTubeProviderOptions) {
        this.#apiKey = options.apiKey;
        this.#region = options.region;
        this.#maximumDurationMs = options.maximumDurationMs ?? defaultMaximumDurationMs;
        this.#fetch = options.fetchImplementation ?? fetch;
    }

    public canHandleUrl(url: URL): boolean {
        return extractYouTubeVideoId(url) !== undefined;
    }

    public async search(query: string): Promise<ProviderTrack> {
        const searchUrl = this.#createApiUrl('search', {
            part: 'snippet',
            type: 'video',
            maxResults: '5',
            q: query,
            ...(this.#region === undefined ? {} : { regionCode: this.#region }),
        });
        const searchResponse = await this.#fetchApi(searchUrl, searchResponseSchema);
        const videoIds = searchResponse.items
            .map((item) => item.id.videoId)
            .filter((videoId): videoId is string => videoId !== undefined);

        if (videoIds.length === 0) {
            throw new NoMediaResultsError(query);
        }

        const videos = await this.#fetchVideos(videoIds);

        for (const videoId of videoIds) {
            const video = videos.items.find((candidate) => candidate.id === videoId);

            if (video !== undefined) {
                try {
                    return this.#mapVideo(video);
                } catch (error: unknown) {
                    if (!(error instanceof MediaUnavailableError)) {
                        throw error;
                    }
                }
            }
        }

        throw new NoMediaResultsError(query);
    }

    public async resolveUrl(url: URL): Promise<ProviderTrack> {
        const videoId = extractYouTubeVideoId(url);

        if (videoId === undefined) {
            throw new UnsupportedMediaUrlError();
        }

        const response = await this.#fetchVideos([videoId]);
        const video = response.items[0];

        if (video === undefined) {
            throw new MediaUnavailableError(
                'The YouTube video is private, deleted, or unavailable',
            );
        }

        return this.#mapVideo(video);
    }

    public createPlayableSource(): Promise<PlayableSource> {
        return Promise.reject(
            new MediaStreamError(
                'The YouTube Data API provides metadata, not an authorized raw audio stream',
            ),
        );
    }

    async #fetchVideos(videoIds: readonly string[]): Promise<z.output<typeof videoResponseSchema>> {
        const url = this.#createApiUrl('videos', {
            part: 'snippet,contentDetails,status',
            id: videoIds.join(','),
        });
        return this.#fetchApi(url, videoResponseSchema);
    }

    #mapVideo(video: z.output<typeof videoResponseSchema>['items'][number]): ProviderTrack {
        if (video.status.privacyStatus !== 'public' || video.status.uploadStatus !== 'processed') {
            throw new MediaUnavailableError('The YouTube video is not publicly playable');
        }

        if (
            video.snippet.liveBroadcastContent === 'live' ||
            video.snippet.liveBroadcastContent === 'upcoming'
        ) {
            throw new MediaUnavailableError('Live and upcoming YouTube streams are not supported');
        }

        if (video.contentDetails.contentRating?.ytRating === 'ytAgeRestricted') {
            throw new MediaUnavailableError('Age-restricted YouTube videos are not supported');
        }

        if (this.#isRegionRestricted(video.contentDetails.regionRestriction)) {
            throw new MediaUnavailableError(
                'The YouTube video is unavailable in the configured region',
            );
        }

        const durationMs = parseYouTubeDuration(video.contentDetails.duration);

        if (durationMs > this.#maximumDurationMs) {
            throw new MediaUnavailableError(
                'The YouTube video exceeds the maximum supported duration',
            );
        }

        const thumbnails = video.snippet.thumbnails;
        const thumbnailUrl =
            thumbnails.maxres?.url ??
            thumbnails.standard?.url ??
            thumbnails.high?.url ??
            thumbnails.medium?.url ??
            thumbnails.default?.url;

        return {
            provider: this.name,
            providerTrackId: video.id,
            title: normalizeExternalText(video.snippet.title, 256),
            url: `https://www.youtube.com/watch?v=${video.id}`,
            durationMs,
            ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
        };
    }

    #isRegionRestricted(
        restriction: z.output<
            typeof videoResponseSchema
        >['items'][number]['contentDetails']['regionRestriction'],
    ): boolean {
        if (this.#region === undefined || restriction === undefined) {
            return false;
        }

        return (
            restriction.blocked?.includes(this.#region) === true ||
            (restriction.allowed !== undefined && !restriction.allowed.includes(this.#region))
        );
    }

    #createApiUrl(endpoint: string, parameters: Readonly<Record<string, string>>): URL {
        const url = new URL(endpoint, youtubeApiBaseUrl);

        for (const [name, value] of Object.entries(parameters)) {
            url.searchParams.set(name, value);
        }

        url.searchParams.set('key', this.#apiKey);
        return url;
    }

    async #fetchApi<Schema extends z.ZodType>(url: URL, schema: Schema): Promise<z.output<Schema>> {
        let response: Response;

        try {
            response = await this.#fetch(url);
        } catch (error: unknown) {
            throw new ProviderOperationError(this.name, { cause: error });
        }

        if (!response.ok) {
            throw new ProviderOperationError(this.name);
        }

        const payload: unknown = await response.json();
        const parsedPayload = schema.safeParse(payload);

        if (!parsedPayload.success) {
            throw new ProviderOperationError(this.name);
        }

        return parsedPayload.data;
    }
}

export function extractYouTubeVideoId(url: URL): string | undefined {
    const hostname = url.hostname.toLocaleLowerCase().replace(/^www\./, '');
    let videoId: string | undefined;

    if (hostname === 'youtu.be') {
        videoId = url.pathname.split('/').filter(Boolean)[0];
    } else if (
        hostname === 'youtube.com' ||
        hostname === 'm.youtube.com' ||
        hostname === 'music.youtube.com' ||
        hostname === 'youtube-nocookie.com'
    ) {
        videoId =
            url.searchParams.get('v') ??
            (/^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname)?.[1] || undefined);
    }

    return videoId !== undefined && youtubeVideoIdPattern.test(videoId) ? videoId : undefined;
}

export function parseYouTubeDuration(duration: string): number {
    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(duration);

    if (match === null || match.slice(1).every((part) => part === undefined)) {
        throw new MediaUnavailableError('The YouTube video has an invalid duration');
    }

    const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
    return (
        Number(days) * 86_400_000 +
        Number(hours) * 3_600_000 +
        Number(minutes) * 60_000 +
        Number(seconds) * 1_000
    );
}
