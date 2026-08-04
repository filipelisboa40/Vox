import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';

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
    UnsupportedMediaUrlError,
} from '../provider-errors.js';
import { normalizeExternalText } from '../../utilities/external-text.js';

const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const defaultMaximumDurationMs = 12 * 60 * 60 * 1_000;
const maximumMetadataBytes = 1024 * 1024;
const processStartTimeoutMs = 15_000;

export interface YtDlpMetadata {
    readonly id?: unknown;
    readonly title?: unknown;
    readonly webpage_url?: unknown;
    readonly duration?: unknown;
    readonly thumbnail?: unknown;
    readonly is_live?: unknown;
    readonly live_status?: unknown;
    readonly availability?: unknown;
    readonly age_limit?: unknown;
    readonly entries?: unknown;
}

export interface YtDlpProcess {
    readonly stdout: Readable;
    readonly stderr: Readable;
    kill(signal?: NodeJS.Signals): boolean;
    once(event: 'error', listener: (error: Error) => void): this;
    once(event: 'exit', listener: (code: number | null) => void): this;
    once(event: 'spawn', listener: () => void): this;
}

export interface YtDlpRunner {
    readMetadata(input: string): Promise<YtDlpMetadata>;
    startAudio(input: string, startPositionMs?: number): Promise<YtDlpProcess>;
}

export interface YouTubeProviderOptions {
    readonly maximumDurationMs?: number;
    readonly runner?: YtDlpRunner;
}

export class YouTubeProvider implements AudioProvider {
    public readonly name = 'youtube';
    public readonly supportsSeeking = true;
    readonly #maximumDurationMs: number;
    readonly #runner: YtDlpRunner;

    public constructor(options: YouTubeProviderOptions = {}) {
        this.#maximumDurationMs = options.maximumDurationMs ?? defaultMaximumDurationMs;
        this.#runner = options.runner ?? new ProcessYtDlpRunner();
    }

    public canHandleUrl(url: URL): boolean {
        return extractYouTubeVideoId(url) !== undefined;
    }

    public async search(query: string): Promise<ProviderTrack> {
        try {
            return this.#mapMetadata(await this.#runner.readMetadata(`ytsearch1:${query}`));
        } catch (error: unknown) {
            if (error instanceof MediaUnavailableError) throw error;
            throw new NoMediaResultsError(query);
        }
    }

    public async resolveUrl(url: URL): Promise<ProviderTrack> {
        if (extractYouTubeVideoId(url) === undefined) {
            throw new UnsupportedMediaUrlError();
        }

        try {
            return this.#mapMetadata(await this.#runner.readMetadata(url.toString()));
        } catch (error: unknown) {
            if (error instanceof MediaUnavailableError) throw error;
            throw new MediaUnavailableError('The YouTube video is unavailable');
        }
    }

    public async createPlayableSource(
        track: ProviderTrack,
        options: PlayableSourceOptions = {},
    ): Promise<PlayableSource> {
        if (track.provider !== this.name || !youtubeVideoIdPattern.test(track.providerTrackId)) {
            throw new MediaStreamError('The track is not a valid YouTube track');
        }

        const positionMs = options.startPositionMs ?? 0;

        if (!Number.isFinite(positionMs) || positionMs < 0) {
            throw new MediaStreamError('The requested playback position is invalid');
        }

        let process: YtDlpProcess;

        try {
            process = await this.#runner.startAudio(track.url, positionMs);
        } catch (error: unknown) {
            throw new MediaStreamError('yt-dlp could not create a playable audio stream', {
                cause: error,
            });
        }

        const stream = process.stdout;
        let stderr = '';
        process.stderr.setEncoding('utf8');
        process.stderr.on('data', (chunk: string) => {
            stderr = `${stderr}${chunk}`.slice(-4_096);
        });
        process.once('error', (error) => stream.destroy(error));
        process.once('exit', (code) => {
            if (code !== 0 && !stream.destroyed) {
                stream.destroy(
                    new Error(stderr.trim() || `yt-dlp exited with code ${String(code)}`),
                );
            }
        });

        return {
            stream,
            format: AudioSourceFormat.Unknown,
            dispose: () => {
                stream.destroy();
                process.kill('SIGKILL');
            },
        };
    }

    #mapMetadata(metadata: YtDlpMetadata): ProviderTrack {
        if (metadata.is_live === true || metadata.live_status === 'is_live') {
            throw new MediaUnavailableError('Live YouTube streams are not supported');
        }

        if (metadata.availability === 'private' || metadata.availability === 'subscriber_only') {
            throw new MediaUnavailableError('The YouTube video is not publicly available');
        }

        if (typeof metadata.age_limit === 'number' && metadata.age_limit >= 18) {
            throw new MediaUnavailableError('Age-restricted YouTube videos are not supported');
        }

        if (
            typeof metadata.id !== 'string' ||
            !youtubeVideoIdPattern.test(metadata.id) ||
            typeof metadata.title !== 'string'
        ) {
            throw new MediaUnavailableError('yt-dlp returned invalid YouTube metadata');
        }

        const durationMs =
            typeof metadata.duration === 'number' && Number.isFinite(metadata.duration)
                ? Math.round(metadata.duration * 1_000)
                : null;

        if (durationMs !== null && durationMs > this.#maximumDurationMs) {
            throw new MediaUnavailableError(
                'The YouTube video exceeds the maximum supported duration',
            );
        }

        return {
            provider: this.name,
            providerTrackId: metadata.id,
            title: normalizeExternalText(metadata.title, 256),
            url:
                typeof metadata.webpage_url === 'string'
                    ? metadata.webpage_url
                    : `https://www.youtube.com/watch?v=${metadata.id}`,
            durationMs,
            ...(typeof metadata.thumbnail === 'string' ? { thumbnailUrl: metadata.thumbnail } : {}),
        };
    }
}

export class ProcessYtDlpRunner implements YtDlpRunner {
    public constructor(private readonly executable = process.env.YT_DLP_PATH?.trim() || 'yt-dlp') {}

    public async readMetadata(input: string): Promise<YtDlpMetadata> {
        const process = this.#spawn([
            '--dump-single-json',
            '--no-playlist',
            '--no-warnings',
            '--skip-download',
            input,
        ]);
        const exit = waitForExit(process);
        const chunks: Buffer[] = [];
        let byteLength = 0;

        for await (const chunk of process.stdout) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
            byteLength += buffer.byteLength;

            if (byteLength > maximumMetadataBytes) {
                process.kill('SIGKILL');
                throw new MediaUnavailableError('yt-dlp returned too much metadata');
            }

            chunks.push(buffer);
        }

        const code = await exit;

        if (code !== 0) {
            throw new MediaUnavailableError(
                `yt-dlp metadata lookup exited with code ${String(code)}`,
            );
        }

        return parseYtDlpMetadata(Buffer.concat(chunks).toString('utf8'));
    }

    public async startAudio(input: string, startPositionMs = 0): Promise<YtDlpProcess> {
        const arguments_ = [
            '--no-playlist',
            '--no-warnings',
            '--format',
            'bestaudio/best',
            '--output',
            '-',
        ];

        if (startPositionMs > 0) {
            arguments_.push('--download-sections', `*${(startPositionMs / 1_000).toFixed(3)}-inf`);
        }

        arguments_.push(input);
        const process = this.#spawn(arguments_);
        await waitForSpawn(process);
        return process;
    }

    #spawn(arguments_: readonly string[]): YtDlpProcess {
        return spawn(this.executable, arguments_, {
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
    }
}

/**
 * Converts yt-dlp JSON into one video record. Search expressions such as
 * `ytsearch1:` return a playlist-shaped wrapper even when only one result was
 * requested, while direct video URLs return the video record itself.
 */
export function parseYtDlpMetadata(json: string): YtDlpMetadata {
    const parsed: unknown = JSON.parse(json);

    if (typeof parsed !== 'object' || parsed === null) return {};

    const metadata = parsed as YtDlpMetadata;

    if (Array.isArray(metadata.entries)) {
        const firstEntry: unknown = metadata.entries[0];
        return typeof firstEntry === 'object' && firstEntry !== null ? firstEntry : {};
    }

    return metadata;
}

function waitForSpawn(process: YtDlpProcess): Promise<void> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            process.kill('SIGKILL');
            reject(new Error('yt-dlp did not start in time'));
        }, processStartTimeoutMs);
        timeout.unref?.();
        process.once('spawn', () => {
            clearTimeout(timeout);
            resolve();
        });
        process.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
    });
}

function waitForExit(process: YtDlpProcess): Promise<number | null> {
    return new Promise((resolve, reject) => {
        process.once('exit', resolve);
        process.once('error', reject);
    });
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
