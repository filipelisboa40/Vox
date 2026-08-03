import { describe, expect, it } from 'vitest';

import type { AudioProvider } from '../audio-provider.js';
import {
    MediaStreamError,
    MediaUnavailableError,
    NoMediaResultsError,
} from '../provider-errors.js';
import {
    YouTubeProvider,
    extractYouTubeVideoId,
    parseYouTubeDuration,
} from './youtube-provider.js';

const videoId = 'abcdefghijk';

interface VideoOverrides {
    readonly id?: string;
    readonly title?: string;
    readonly duration?: string;
    readonly liveBroadcastContent?: string;
    readonly privacyStatus?: string;
    readonly uploadStatus?: string;
    readonly ageRestricted?: boolean;
    readonly allowedRegions?: string[];
    readonly blockedRegions?: string[];
}

function createVideo(overrides: VideoOverrides = {}) {
    return {
        id: overrides.id ?? videoId,
        snippet: {
            title: overrides.title ?? 'Example song',
            liveBroadcastContent: overrides.liveBroadcastContent ?? 'none',
            thumbnails: {
                default: { url: 'https://i.ytimg.com/example.jpg' },
                high: { url: 'https://i.ytimg.com/example-high.jpg' },
            },
        },
        contentDetails: {
            duration: overrides.duration ?? 'PT3M5S',
            ...(overrides.ageRestricted === true
                ? { contentRating: { ytRating: 'ytAgeRestricted' } }
                : {}),
            ...(overrides.allowedRegions === undefined && overrides.blockedRegions === undefined
                ? {}
                : {
                      regionRestriction: {
                          ...(overrides.allowedRegions === undefined
                              ? {}
                              : { allowed: overrides.allowedRegions }),
                          ...(overrides.blockedRegions === undefined
                              ? {}
                              : { blocked: overrides.blockedRegions }),
                      },
                  }),
        },
        status: {
            privacyStatus: overrides.privacyStatus ?? 'public',
            uploadStatus: overrides.uploadStatus ?? 'processed',
        },
    };
}

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function createFetchFixture(responses: readonly Response[]): {
    readonly fetchImplementation: typeof fetch;
    readonly requestedUrls: URL[];
} {
    const remainingResponses = [...responses];
    const requestedUrls: URL[] = [];
    const fetchImplementation: typeof fetch = (input) => {
        const url =
            input instanceof URL
                ? input
                : typeof input === 'string'
                  ? new URL(input)
                  : new URL(input.url);
        requestedUrls.push(url);
        const response = remainingResponses.shift();

        return response === undefined
            ? Promise.reject(new Error('No fake response configured'))
            : Promise.resolve(response);
    };

    return { fetchImplementation, requestedUrls };
}

function createProvider(
    options: Partial<ConstructorParameters<typeof YouTubeProvider>[0]> &
        Pick<ConstructorParameters<typeof YouTubeProvider>[0], 'apiKey'>,
): YouTubeProvider {
    return new YouTubeProvider({
        lavalinkUrl: 'http://localhost:2333',
        lavalinkPassword: 'lavalink-password',
        ...options,
    });
}

describe('extractYouTubeVideoId', () => {
    it.each([
        `https://youtu.be/${videoId}`,
        `https://www.youtube.com/watch?v=${videoId}`,
        `https://music.youtube.com/watch?v=${videoId}`,
        `https://youtube.com/shorts/${videoId}`,
        `https://youtube.com/live/${videoId}`,
        `https://www.youtube-nocookie.com/embed/${videoId}`,
    ])('extracts the canonical ID from %s', (url) => {
        expect(extractYouTubeVideoId(new URL(url))).toBe(videoId);
    });

    it('rejects unsupported hosts and malformed IDs', () => {
        expect(
            extractYouTubeVideoId(new URL(`https://example.com/watch?v=${videoId}`)),
        ).toBeUndefined();
        expect(extractYouTubeVideoId(new URL('https://youtube.com/watch?v=short'))).toBeUndefined();
    });
});

describe('parseYouTubeDuration', () => {
    it.each([
        ['PT3M5S', 185_000],
        ['PT1H2M3.5S', 3_723_500],
        ['P1DT2H', 93_600_000],
    ])('parses %s', (duration, expectedMilliseconds) => {
        expect(parseYouTubeDuration(duration)).toBe(expectedMilliseconds);
    });

    it('rejects malformed durations', () => {
        expect(() => parseYouTubeDuration('not-a-duration')).toThrow(MediaUnavailableError);
    });
});

describe('YouTubeProvider', () => {
    it('resolves a URL into normalized track metadata', async () => {
        const fixture = createFetchFixture([
            jsonResponse({ items: [createVideo({ title: '  Example\n song  ' })] }),
        ]);
        const provider = createProvider({
            apiKey: 'secret-key',
            fetchImplementation: fixture.fetchImplementation,
        });

        await expect(provider.resolveUrl(new URL(`https://youtu.be/${videoId}`))).resolves.toEqual({
            provider: 'youtube',
            providerTrackId: videoId,
            title: 'Example song',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            durationMs: 185_000,
            thumbnailUrl: 'https://i.ytimg.com/example-high.jpg',
        });
        expect(fixture.requestedUrls[0]?.searchParams.get('key')).toBe('secret-key');
    });

    it('searches and selects the first valid video result', async () => {
        const validId = 'lmnopqrstuv';
        const fixture = createFetchFixture([
            jsonResponse({ items: [{ id: { videoId } }, { id: { videoId: validId } }] }),
            jsonResponse({
                items: [
                    createVideo({ liveBroadcastContent: 'live' }),
                    createVideo({ id: validId, title: 'Wanted song' }),
                ],
            }),
        ]);
        const provider = createProvider({
            apiKey: 'key',
            region: 'PT',
            fetchImplementation: fixture.fetchImplementation,
        });

        await expect(provider.search('wanted')).resolves.toMatchObject({
            providerTrackId: validId,
            title: 'Wanted song',
        });
        expect(fixture.requestedUrls[0]?.searchParams.get('q')).toBe('wanted');
        expect(fixture.requestedUrls[0]?.searchParams.get('regionCode')).toBe('PT');
    });

    it('rejects private or missing videos', async () => {
        const privateFixture = createFetchFixture([
            jsonResponse({ items: [createVideo({ privacyStatus: 'private' })] }),
        ]);
        const missingFixture = createFetchFixture([jsonResponse({ items: [] })]);

        await expect(
            createProvider({
                apiKey: 'key',
                fetchImplementation: privateFixture.fetchImplementation,
            }).resolveUrl(new URL(`https://youtu.be/${videoId}`)),
        ).rejects.toBeInstanceOf(MediaUnavailableError);
        await expect(
            createProvider({
                apiKey: 'key',
                fetchImplementation: missingFixture.fetchImplementation,
            }).resolveUrl(new URL(`https://youtu.be/${videoId}`)),
        ).rejects.toBeInstanceOf(MediaUnavailableError);
    });

    it.each([
        createVideo({ liveBroadcastContent: 'live' }),
        createVideo({ ageRestricted: true }),
        createVideo({ blockedRegions: ['PT'] }),
        createVideo({ allowedRegions: ['US'] }),
        createVideo({ duration: 'PT13H' }),
    ])('rejects restricted or unsupported video metadata', async (video) => {
        const fixture = createFetchFixture([jsonResponse({ items: [video] })]);
        const provider = createProvider({
            apiKey: 'key',
            region: 'PT',
            fetchImplementation: fixture.fetchImplementation,
        });

        await expect(
            provider.resolveUrl(new URL(`https://youtu.be/${videoId}`)),
        ).rejects.toBeInstanceOf(MediaUnavailableError);
    });

    it('returns no-results errors without making real API requests', async () => {
        const fixture = createFetchFixture([jsonResponse({ items: [] })]);
        const provider = createProvider({
            apiKey: 'key',
            fetchImplementation: fixture.fetchImplementation,
        });

        await expect(provider.search('missing')).rejects.toBeInstanceOf(NoMediaResultsError);
    });

    it('streams playable audio from the authenticated Lavalink endpoint', async () => {
        let requestUrl: URL | undefined;
        let authorization: string | null = null;
        const provider = createProvider({
            apiKey: 'key',
            fetchImplementation: (input, init) => {
                requestUrl = new URL(input instanceof Request ? input.url : input.toString());
                authorization = new Headers(init?.headers).get('authorization');
                return Promise.resolve(
                    new Response('audio bytes', {
                        headers: { 'content-type': 'audio/webm' },
                    }),
                );
            },
        });
        const audioProvider: AudioProvider = provider;
        const track = {
            provider: 'youtube',
            providerTrackId: videoId,
            title: 'Song',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            durationMs: 1000,
        };

        const source = await audioProvider.createPlayableSource(track);

        expect(requestUrl?.href).toBe(`http://localhost:2333/youtube/stream/${videoId}`);
        expect(authorization).toBe('lavalink-password');
        expect(source.format).toBe('webm-opus');
        source.stream.setEncoding('utf8');
        let streamedAudio = '';

        for await (const chunk of source.stream) {
            streamedAudio += String(chunk);
        }

        expect(streamedAudio).toBe('audio bytes');
        await source.dispose?.();
    });

    it('wraps Lavalink connection and response failures as media stream errors', async () => {
        const unreachableProvider = createProvider({
            apiKey: 'key',
            fetchImplementation: () => Promise.reject(new Error('connection refused')),
        });
        const rejectedProvider = createProvider({
            apiKey: 'key',
            fetchImplementation: () => Promise.resolve(new Response(null, { status: 401 })),
        });
        const track = {
            provider: 'youtube',
            providerTrackId: videoId,
            title: 'Song',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            durationMs: 1000,
        };

        await expect(unreachableProvider.createPlayableSource(track)).rejects.toBeInstanceOf(
            MediaStreamError,
        );
        await expect(rejectedProvider.createPlayableSource(track)).rejects.toBeInstanceOf(
            MediaStreamError,
        );
    });

    it('rejects oversized Lavalink responses before buffering them', async () => {
        const provider = createProvider({
            apiKey: 'key',
            fetchImplementation: () =>
                Promise.resolve(
                    new Response('audio', {
                        headers: { 'content-length': String(257 * 1024 * 1024) },
                    }),
                ),
        });

        await expect(
            provider.createPlayableSource({
                provider: 'youtube',
                providerTrackId: videoId,
                title: 'Song',
                url: `https://www.youtube.com/watch?v=${videoId}`,
                durationMs: 1000,
            }),
        ).rejects.toBeInstanceOf(MediaStreamError);
    });
});
