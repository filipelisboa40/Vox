import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import type { AudioProvider } from '../audio-provider.js';
import { MediaStreamError, MediaUnavailableError } from '../provider-errors.js';
import {
    YouTubeProvider,
    extractYouTubeVideoId,
    parseYtDlpMetadata,
    type YtDlpMetadata,
    type YtDlpProcess,
    type YtDlpRunner,
} from './youtube-provider.js';

const videoId = 'abcdefghijk';

function createProcess(audio = 'audio'): {
    readonly process: YtDlpProcess;
    readonly kill: ReturnType<typeof vi.fn>;
} {
    const emitter = new EventEmitter();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const kill = vi.fn(() => true);
    const process = Object.assign(emitter, { stdout, stderr, kill }) as YtDlpProcess;
    stdout.end(audio);
    stderr.end();
    return { process, kill };
}

function createRunner(metadata: YtDlpMetadata): {
    readonly runner: YtDlpRunner;
    readonly readMetadata: ReturnType<typeof vi.fn>;
    readonly startAudio: ReturnType<typeof vi.fn>;
    readonly mediaProcess: ReturnType<typeof createProcess>;
} {
    const mediaProcess = createProcess();
    const readMetadata = vi.fn().mockResolvedValue(metadata);
    const startAudio = vi.fn().mockResolvedValue(mediaProcess.process);
    return { runner: { readMetadata, startAudio }, readMetadata, startAudio, mediaProcess };
}

function validMetadata(overrides: YtDlpMetadata = {}): YtDlpMetadata {
    return {
        id: videoId,
        title: '  Example\n song  ',
        webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
        duration: 185,
        thumbnail: 'https://i.ytimg.com/example.jpg',
        ...overrides,
    };
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

describe('parseYtDlpMetadata', () => {
    it('keeps metadata returned for a direct video URL', () => {
        expect(parseYtDlpMetadata(JSON.stringify(validMetadata()))).toMatchObject({
            id: videoId,
            title: '  Example\n song  ',
        });
    });

    it('unwraps the first result returned by ytsearch', () => {
        expect(
            parseYtDlpMetadata(
                JSON.stringify({
                    id: 'example song',
                    title: 'example song',
                    entries: [validMetadata()],
                }),
            ),
        ).toMatchObject({ id: videoId });
    });

    it('returns empty metadata when a search has no entries', () => {
        expect(parseYtDlpMetadata(JSON.stringify({ entries: [] }))).toEqual({});
    });
});

describe('YouTubeProvider with yt-dlp', () => {
    it('searches through ytsearch and maps normalized metadata', async () => {
        const fixture = createRunner(validMetadata());
        const provider = new YouTubeProvider({ runner: fixture.runner });

        await expect(provider.search('example song')).resolves.toEqual({
            provider: 'youtube',
            providerTrackId: videoId,
            title: 'Example song',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            durationMs: 185_000,
            thumbnailUrl: 'https://i.ytimg.com/example.jpg',
        });
        expect(fixture.readMetadata).toHaveBeenCalledWith('ytsearch1:example song');
    });

    it('resolves supported YouTube URLs through yt-dlp', async () => {
        const fixture = createRunner(validMetadata());
        const provider = new YouTubeProvider({ runner: fixture.runner });
        const url = new URL(`https://youtu.be/${videoId}`);

        await expect(provider.resolveUrl(url)).resolves.toMatchObject({
            providerTrackId: videoId,
        });
        expect(fixture.readMetadata).toHaveBeenCalledWith(url.toString());
    });

    it.each([
        validMetadata({ is_live: true }),
        validMetadata({ availability: 'private' }),
        validMetadata({ age_limit: 18 }),
        validMetadata({ duration: 13 * 60 * 60 }),
        validMetadata({ id: 'invalid' }),
    ])('rejects restricted or invalid metadata', async (metadata) => {
        const fixture = createRunner(metadata);
        const provider = new YouTubeProvider({ runner: fixture.runner });

        await expect(
            provider.resolveUrl(new URL(`https://youtu.be/${videoId}`)),
        ).rejects.toBeInstanceOf(MediaUnavailableError);
    });

    it('streams yt-dlp stdout and terminates the process during disposal', async () => {
        const fixture = createRunner(validMetadata());
        const provider: AudioProvider = new YouTubeProvider({ runner: fixture.runner });
        const track = {
            provider: 'youtube',
            providerTrackId: videoId,
            title: 'Song',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            durationMs: 1_000,
        };

        const source = await provider.createPlayableSource(track, { startPositionMs: 30_000 });
        source.stream.setEncoding('utf8');
        let audio = '';
        for await (const chunk of source.stream) audio += String(chunk);

        expect(audio).toBe('audio');
        expect(source.format).toBe('unknown');
        expect(fixture.startAudio).toHaveBeenCalledWith(track.url, 30_000);
        await source.dispose?.();
        expect(fixture.mediaProcess.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('wraps yt-dlp startup failures as media stream errors', async () => {
        const runner: YtDlpRunner = {
            readMetadata: vi.fn().mockResolvedValue(validMetadata()),
            startAudio: vi.fn().mockRejectedValue(new Error('yt-dlp missing')),
        };
        const provider = new YouTubeProvider({ runner });

        await expect(
            provider.createPlayableSource({
                provider: 'youtube',
                providerTrackId: videoId,
                title: 'Song',
                url: `https://www.youtube.com/watch?v=${videoId}`,
                durationMs: 1_000,
            }),
        ).rejects.toBeInstanceOf(MediaStreamError);
    });
});
