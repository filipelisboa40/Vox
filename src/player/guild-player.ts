import {
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    type AudioPlayer,
    type VoiceConnection,
} from '@discordjs/voice';
import type { Logger } from 'pino';

import type { PlaybackController } from './playback-controller.js';

const reconnectTimeoutMs = 5_000;

export interface GuildPlayerOptions {
    readonly guildId: string;
    readonly voiceChannelId: string;
    readonly connection: VoiceConnection;
    readonly audioPlayer: AudioPlayer;
    readonly logger: Logger;
    readonly onDestroyed: () => void;
    readonly playback?: PlaybackController;
    readonly idleDisconnectMs?: number;
}

export class VoiceConnectionTimeoutError extends Error {
    public constructor(options?: ErrorOptions) {
        super('The bot could not connect to the voice channel in time', options);
        this.name = 'VoiceConnectionTimeoutError';
    }
}

export class GuildPlayer {
    public readonly guildId: string;
    public readonly voiceChannelId: string;
    public readonly connection: VoiceConnection;
    public readonly audioPlayer: AudioPlayer;
    readonly #logger: Logger;
    public readonly playback: PlaybackController | undefined;
    #destroyed = false;
    #idleTimer: ReturnType<typeof setTimeout> | undefined;
    readonly #idleDisconnectMs: number;

    public constructor(options: GuildPlayerOptions) {
        this.guildId = options.guildId;
        this.voiceChannelId = options.voiceChannelId;
        this.connection = options.connection;
        this.audioPlayer = options.audioPlayer;
        this.#logger = options.logger;
        this.playback = options.playback;
        this.#idleDisconnectMs = options.idleDisconnectMs ?? 300_000;

        this.connection.subscribe(this.audioPlayer);
        this.#registerLifecycleHandlers(options.onDestroyed);
    }

    public async destroy(): Promise<void> {
        if (this.#destroyed) {
            return;
        }

        this.#destroyed = true;
        this.#cancelIdleTimer();
        await this.playback?.dispose();

        if (this.playback === undefined) {
            this.audioPlayer.stop(true);
        }

        if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            this.connection.destroy();
        }
    }

    public async waitUntilReady(timeoutMs = 15_000): Promise<void> {
        if (this.connection.state.status === VoiceConnectionStatus.Ready) {
            return;
        }

        try {
            await entersState(this.connection, VoiceConnectionStatus.Ready, timeoutMs);
        } catch (error: unknown) {
            await this.destroy();
            throw new VoiceConnectionTimeoutError({ cause: error });
        }
    }

    #registerLifecycleHandlers(onDestroyed: () => void): void {
        this.connection.on(VoiceConnectionStatus.Ready, () => {
            this.#logger.info(
                { guildId: this.guildId, voiceChannelId: this.voiceChannelId },
                'Voice connection is ready',
            );
        });

        this.connection.on(VoiceConnectionStatus.Disconnected, () => {
            void this.#recoverConnection().catch((error: unknown) => {
                this.#logger.warn({ error, guildId: this.guildId }, 'Voice reconnection failed');
                void this.destroy().catch((destroyError: unknown) => {
                    this.#logger.error(
                        { error: destroyError, guildId: this.guildId },
                        'Guild player cleanup failed',
                    );
                });
            });
        });

        this.connection.on(VoiceConnectionStatus.Destroyed, () => {
            const externallyDestroyed = !this.#destroyed;
            this.#destroyed = true;
            this.#cancelIdleTimer();
            onDestroyed();

            if (externallyDestroyed) {
                void this.#disposeAfterExternalDisconnect();
            }
            this.#logger.info({ guildId: this.guildId }, 'Voice connection was destroyed');
        });

        this.audioPlayer.on(AudioPlayerStatus.Playing, () => this.#cancelIdleTimer());

        this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
            this.#logger.debug({ guildId: this.guildId }, 'Guild audio player is idle');
            this.#scheduleIdleDisconnect();
        });

        this.audioPlayer.on('error', (error) => {
            this.#logger.error({ error, guildId: this.guildId }, 'Guild audio player failed');
        });
    }

    #scheduleIdleDisconnect(): void {
        if (this.#destroyed || this.#idleDisconnectMs === 0 || this.#idleTimer !== undefined) {
            return;
        }

        this.#idleTimer = setTimeout(() => {
            this.#idleTimer = undefined;

            if (
                this.audioPlayer.state.status === AudioPlayerStatus.Idle &&
                this.playback?.currentTrack === undefined &&
                (this.playback?.queue.isEmpty ?? true)
            ) {
                void this.destroy().catch((error: unknown) => {
                    this.#logger.error(
                        { error, guildId: this.guildId },
                        'Idle guild player cleanup failed',
                    );
                });
            }
        }, this.#idleDisconnectMs);
        this.#idleTimer.unref?.();
    }

    #cancelIdleTimer(): void {
        if (this.#idleTimer !== undefined) {
            clearTimeout(this.#idleTimer);
            this.#idleTimer = undefined;
        }
    }

    async #disposeAfterExternalDisconnect(): Promise<void> {
        await this.playback?.dispose();

        if (this.playback === undefined) {
            this.audioPlayer.stop(true);
        }
    }

    async #recoverConnection(): Promise<void> {
        // Discord can briefly disconnect while attempting to resume or re-signal the session.
        await Promise.race([
            entersState(this.connection, VoiceConnectionStatus.Signalling, reconnectTimeoutMs),
            entersState(this.connection, VoiceConnectionStatus.Connecting, reconnectTimeoutMs),
        ]);
    }
}
