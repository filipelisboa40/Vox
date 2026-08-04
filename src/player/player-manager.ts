import {
    NoSubscriberBehavior,
    createAudioPlayer,
    joinVoiceChannel,
    type DiscordGatewayAdapterCreator,
} from '@discordjs/voice';
import type { Logger } from 'pino';

import type { ProviderManager } from '../providers/provider-manager.js';
import { AudioResourceManager } from './audio-resource-manager.js';
import { GuildPlayer } from './guild-player.js';
import { PlaybackController } from './playback-controller.js';

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

    public async destroy(guildId: string): Promise<boolean> {
        const player = this.#players.get(guildId);

        if (player === undefined) {
            return false;
        }

        this.#players.delete(guildId);
        await player.destroy();
        return true;
    }

    public async destroyAll(): Promise<void> {
        const players = [...this.#players.values()];
        this.#players.clear();

        for (const player of players) {
            await player.destroy();
        }
    }

    public async handleBotVoiceStateUpdate(options: {
        readonly guildId: string;
        readonly userId: string;
        readonly botUserId: string;
        readonly voiceChannelId: string | null;
    }): Promise<boolean> {
        const player = this.#players.get(options.guildId);

        if (
            options.userId !== options.botUserId ||
            player === undefined ||
            player.voiceChannelId === options.voiceChannelId
        ) {
            return false;
        }

        return this.destroy(options.guildId);
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

export function createManagedGuildPlayerFactory(
    logger: Logger,
    providerManager: ProviderManager,
    defaultVolume = 0.5,
    idleDisconnectMs = 300_000,
): GuildPlayerFactory {
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
        const playbackReference: { current?: PlaybackController } = {};
        const audioResources = new AudioResourceManager({
            audioPlayer,
            provider: providerManager,
            logger,
            onTrackFinished: (track) => playbackReference.current?.handleTrackFinished(track),
            onTrackFailed: () => playbackReference.current?.handleTrackFailed(),
            defaultVolume,
        });
        const playback = new PlaybackController(audioResources, logger);
        playbackReference.current = playback;

        return new GuildPlayer({
            ...options,
            connection,
            audioPlayer,
            playback,
            defaultVolume,
            idleDisconnectMs,
            logger,
            onDestroyed,
        });
    };
}
