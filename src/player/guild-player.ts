import {
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    type AudioPlayer,
    type VoiceConnection,
} from '@discordjs/voice';
import type { Logger } from 'pino';

const reconnectTimeoutMs = 5_000;

export interface GuildPlayerOptions {
    readonly guildId: string;
    readonly voiceChannelId: string;
    readonly connection: VoiceConnection;
    readonly audioPlayer: AudioPlayer;
    readonly logger: Logger;
    readonly onDestroyed: () => void;
}

export class GuildPlayer {
    public readonly guildId: string;
    public readonly voiceChannelId: string;
    public readonly connection: VoiceConnection;
    public readonly audioPlayer: AudioPlayer;
    readonly #logger: Logger;
    #destroyed = false;

    public constructor(options: GuildPlayerOptions) {
        this.guildId = options.guildId;
        this.voiceChannelId = options.voiceChannelId;
        this.connection = options.connection;
        this.audioPlayer = options.audioPlayer;
        this.#logger = options.logger;

        this.connection.subscribe(this.audioPlayer);
        this.#registerLifecycleHandlers(options.onDestroyed);
    }

    public destroy(): void {
        if (this.#destroyed) {
            return;
        }

        this.#destroyed = true;
        this.audioPlayer.stop(true);

        if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            this.connection.destroy();
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
                this.destroy();
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
