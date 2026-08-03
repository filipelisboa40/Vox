import {
    NoSubscriberBehavior,
    createAudioPlayer,
    joinVoiceChannel,
    type DiscordGatewayAdapterCreator,
} from '@discordjs/voice';
import type { Logger } from 'pino';

import { GuildPlayer } from './guild-player.js';

export interface JoinGuildPlayerOptions {
    readonly guildId: string;
    readonly voiceChannelId: string;
    readonly adapterCreator: DiscordGatewayAdapterCreator;
}

export type GuildPlayerFactory = (
    options: JoinGuildPlayerOptions,
    onDestroyed: () => void,
) => GuildPlayer;

export class PlayerVoiceChannelMismatchError extends Error {
    public constructor() {
        super('The bot is already connected to a different voice channel in this server');
        this.name = 'PlayerVoiceChannelMismatchError';
    }
}

export class PlayerManager {
    readonly #players = new Map<string, GuildPlayer>();

    public constructor(
        logger: Logger,
        private readonly createGuildPlayer: GuildPlayerFactory = createDefaultGuildPlayer(logger),
    ) {}

    public get size(): number {
        return this.#players.size;
    }

    public get(guildId: string): GuildPlayer | undefined {
        return this.#players.get(guildId);
    }

    public getOrCreate(options: JoinGuildPlayerOptions): GuildPlayer {
        const existingPlayer = this.#players.get(options.guildId);

        if (existingPlayer !== undefined) {
            if (existingPlayer.voiceChannelId !== options.voiceChannelId) {
                throw new PlayerVoiceChannelMismatchError();
            }

            return existingPlayer;
        }

        const playerReference: { current?: GuildPlayer } = {};
        const removePlayer = (): void => {
            // A stale destroy event must not remove a newer replacement player.
            if (this.#players.get(options.guildId) === playerReference.current) {
                this.#players.delete(options.guildId);
            }
        };

        const player = this.createGuildPlayer(options, removePlayer);
        playerReference.current = player;
        this.#players.set(options.guildId, player);
        return player;
    }

    public destroy(guildId: string): boolean {
        const player = this.#players.get(guildId);

        if (player === undefined) {
            return false;
        }

        this.#players.delete(guildId);
        player.destroy();
        return true;
    }

    public destroyAll(): void {
        const players = [...this.#players.values()];
        this.#players.clear();

        for (const player of players) {
            player.destroy();
        }
    }
}

function createDefaultGuildPlayer(logger: Logger): GuildPlayerFactory {
    return (options, onDestroyed) => {
        const connection = joinVoiceChannel({
            guildId: options.guildId,
            channelId: options.voiceChannelId,
            adapterCreator: options.adapterCreator,
            selfDeaf: true,
        });
        const audioPlayer = createAudioPlayer({
            behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
        });

        return new GuildPlayer({
            ...options,
            connection,
            audioPlayer,
            logger,
            onDestroyed,
        });
    };
}
