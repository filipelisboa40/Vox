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
    readonly defaultVolume?: number;
}

export class GuildPlayer {
    public readonly guildId: string;
    public readonly voiceChannelId: string;
    public readonly connection: VoiceConnection;
    public readonly audioPlayer: AudioPlayer;
    readonly #logger: Logger;
    public readonly playback: PlaybackController | undefined;
    #volume: number;
    #destroyed = false;

    public constructor(options: GuildPlayerOptions) {
        this.guildId = options.guildId;
        this.voiceChannelId = options.voiceChannelId;
        this.connection = options.connection;
        this.audioPlayer = options.audioPlayer;
        this.#logger = options.logger;
        this.playback = options.playback;
        this.#volume = validateGuildVolume(options.defaultVolume ?? 0.5);

        this.connection.subscribe(this.audioPlayer);
        this.#registerLifecycleHandlers(options.onDestroyed);
    }

    public async destroy(): Promise<void> {
        if (this.#destroyed) {
            return;
        }

        this.#destroyed = true;
        await this.playback?.dispose();

        if (this.playback === undefined) {
            this.audioPlayer.stop(true);
        }

        if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            this.connection.destroy();
        }
    }

    public get volume(): number {
        return this.#volume;
    }

    public setVolume(volume: number): void {
        const normalized = validateGuildVolume(volume);
        this.playback?.setVolume(normalized);
        this.#volume = normalized;
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
            this.#destroyed = true;
            onDestroyed();
            this.#logger.info({ guildId: this.guildId }, 'Voice connection was destroyed');
        });

        this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
            this.#logger.debug({ guildId: this.guildId }, 'Guild audio player is idle');
        });

        this.audioPlayer.on('error', (error) => {
            this.#logger.error({ error, guildId: this.guildId }, 'Guild audio player failed');
        });
    }

    async #recoverConnection(): Promise<void> {
        // Discord can briefly disconnect while attempting to resume or re-signal the session.
        await Promise.race([
            entersState(this.connection, VoiceConnectionStatus.Signalling, reconnectTimeoutMs),
            entersState(this.connection, VoiceConnectionStatus.Connecting, reconnectTimeoutMs),
        ]);
    }
}

function validateGuildVolume(volume: number): number {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
        throw new RangeError('Guild volume must be between 0 and 1');
    }

    return volume;
}
