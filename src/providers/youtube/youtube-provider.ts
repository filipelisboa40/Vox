import { z } from 'zod';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import ffmpegPath from 'ffmpeg-static';

import {
    AudioSourceFormat,
    type AudioProvider,
    type PlayableSource,
    type PlayableSourceOptions,
    type ProviderTrack,
} from '../audio-provider.js';
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
const maximumPlayableSourceBytes = 256 * 1024 * 1024;

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
    readonly lavalinkUrl: string;
    readonly lavalinkPassword: string;
    readonly region?: string;
    readonly maximumDurationMs?: number;
    readonly fetchImplementation?: typeof fetch;
}

export class YouTubeProvider implements AudioProvider {
    public readonly name = 'youtube';
    public readonly supportsSeeking = true;
    readonly #apiKey: string;
    readonly #lavalinkUrl: URL;
    readonly #lavalinkPassword: string;
    readonly #region: string | undefined;
    readonly #maximumDurationMs: number;
    readonly #fetch: typeof fetch;

    public constructor(options: YouTubeProviderOptions) {
        this.#apiKey = options.apiKey;
        this.#lavalinkUrl = new URL(options.lavalinkUrl);
        this.#lavalinkPassword = options.lavalinkPassword;
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

    public async createPlayableSource(
        track: ProviderTrack,
        options: PlayableSourceOptions = {},
    ): Promise<PlayableSource> {
        if (track.provider !== this.name || !youtubeVideoIdPattern.test(track.providerTrackId)) {
            throw new MediaStreamError('The track is not a valid YouTube track');
        }

        // This endpoint is provided by Lavalink's youtube-source plugin. The bot still
        // owns the Discord voice connection, so the response body becomes its audio input.
        const streamUrl = new URL(
            `youtube/stream/${encodeURIComponent(track.providerTrackId)}`,
            ensureTrailingSlash(this.#lavalinkUrl),
        );

        const abortController = new AbortController();
        let response: Response;

        try {
            response = await this.#fetch(streamUrl, {
                headers: { Authorization: this.#lavalinkPassword },
                signal: abortController.signal,
            });
        } catch (error: unknown) {
            throw new MediaStreamError('Could not connect to the Lavalink media server', {
                cause: error,
            });
        }

        if (!response.ok || response.body === null) {
            abortController.abort();
            throw new MediaStreamError('Lavalink could not create a stream for this track');
        }

        const declaredLength = Number(response.headers.get('content-length'));

        if (Number.isFinite(declaredLength) && declaredLength > maximumPlayableSourceBytes) {
            abortController.abort();
            throw new MediaStreamError('The Lavalink audio response is too large to buffer');
        }

        let audio: Buffer;

        try {
            // Drain Lavalink immediately. Passing the HTTP body directly to FFmpeg applies
            // playback-speed backpressure and can leave Undertow's socket idle long enough
            // to be terminated before the track finishes.
            audio = Buffer.from(await response.arrayBuffer());
        } catch (error: unknown) {
            abortController.abort();
            throw new MediaStreamError('Lavalink terminated the audio download', {
                cause: error,
            });
        }

        if (audio.byteLength > maximumPlayableSourceBytes) {
            abortController.abort();
            throw new MediaStreamError('The Lavalink audio response is too large to buffer');
        }

        const positionMs = options.startPositionMs ?? 0;

        if (!Number.isFinite(positionMs) || positionMs < 0) {
            abortController.abort();
            throw new MediaStreamError('The requested playback position is invalid');
        }

        if (positionMs > 0) {
            abortController.abort();
            return createSeekedSource(audio, positionMs);
        }

        const stream = Readable.from([audio]);

        return {
            stream,
            format: inferAudioSourceFormat(response.headers.get('content-type')),
            dispose: () => {
                abortController.abort();
                stream.destroy();
            },
        };
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

function createSeekedSource(audio: Buffer, positionMs: number): PlayableSource {
    if (ffmpegPath === null) {
        throw new MediaStreamError('FFmpeg is required for seeking');
    }

    const process = spawn(
        ffmpegPath,
        [
            '-hide_banner',
            '-loglevel',
            'error',
            '-ss',
            (positionMs / 1_000).toFixed(3),
            '-i',
            'pipe:0',
            '-vn',
            '-c:a',
            'libopus',
            '-f',
            'ogg',
            'pipe:1',
        ],
        { stdio: ['pipe', 'pipe', 'ignore'] },
    );
    const stream = process.stdout;
    process.once('error', (error) => stream.destroy(error));
    process.stdin.end(audio);

    return {
        stream,
        format: AudioSourceFormat.OggOpus,
        dispose: () => {
            stream.destroy();
            process.kill();
        },
    };
}

function ensureTrailingSlash(url: URL): URL {
    const normalized = new URL(url);
    normalized.pathname = `${normalized.pathname.replace(/\/$/, '')}/`;
    return normalized;
}

function inferAudioSourceFormat(contentType: string | null): AudioSourceFormat {
    const normalized = contentType?.toLocaleLowerCase() ?? '';

    if (normalized.includes('webm')) {
        return AudioSourceFormat.WebmOpus;
    }

    if (normalized.includes('ogg')) {
        return AudioSourceFormat.OggOpus;
    }

    if (normalized.includes('opus')) {
        return AudioSourceFormat.Opus;
    }

    return AudioSourceFormat.Unknown;
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
