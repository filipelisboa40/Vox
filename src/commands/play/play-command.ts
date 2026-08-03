import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

import type { Track } from '../../models/track.js';
import type { GuildPlayer } from '../../player/guild-player.js';
import {
    PlayerVoiceChannelMismatchError,
    type JoinGuildPlayerOptions,
} from '../../player/player-manager.js';
import {
    VoiceAccessError,
    resolveVoiceJoinTarget,
    type VoiceJoinTarget,
} from '../../player/voice-access.js';
import type { ProviderTrack } from '../../providers/audio-provider.js';
import { MediaProviderError } from '../../providers/provider-errors.js';
import { escapeDiscordFormatting } from '../../utilities/external-text.js';
import type { Command } from '../command.js';

export interface TrackResolver {
    resolve(queryOrUrl: string): Promise<ProviderTrack>;
}

export interface GuildPlayerResolver {
    getOrCreate(options: JoinGuildPlayerOptions): GuildPlayer;
}

export interface PlayCommandDependencies {
    readonly providers: TrackResolver;
    readonly players: GuildPlayerResolver;
    readonly resolveVoiceTarget?: (
        interaction: ChatInputCommandInteraction,
    ) => Promise<VoiceJoinTarget>;
}

export const playCommandData = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Searches for and adds music to the queue')
    .addStringOption((option) =>
        option.setName('query').setDescription('A song name or supported URL').setRequired(true),
    );

export function createPlayCommand(dependencies: PlayCommandDependencies): Command {
    const voiceTargetResolver = dependencies.resolveVoiceTarget ?? resolveVoiceJoinTarget;

    return {
        data: playCommandData,
        deferReply: true,
        execute: async (interaction) => {
            try {
                const voiceTarget = await voiceTargetResolver(interaction);
                const query = interaction.options.getString('query', true);
                const providerTrack = await dependencies.providers.resolve(query);
                const guildPlayer = dependencies.players.getOrCreate(voiceTarget);

                if (guildPlayer.playback === undefined) {
                    throw new Error('The guild player does not have a playback controller');
                }

                const track = toRequestedTrack(providerTrack, interaction);
                const result = await guildPlayer.playback.enqueue(track);
                await interaction.editReply(formatPlayResponse(track, result));
            } catch (error: unknown) {
                if (
                    error instanceof MediaProviderError ||
                    error instanceof VoiceAccessError ||
                    error instanceof PlayerVoiceChannelMismatchError
                ) {
                    await interaction.editReply(error.message);
                    return;
                }

                throw error;
            }
        },
    };
}

function toRequestedTrack(
    providerTrack: ProviderTrack,
    interaction: ChatInputCommandInteraction,
): Track {
    return {
        ...providerTrack,
        requestedBy: {
            userId: interaction.user.id,
            displayName: interaction.user.globalName ?? interaction.user.username,
        },
    };
}

function formatPlayResponse(
    track: Track,
    result: Awaited<ReturnType<NonNullable<GuildPlayer['playback']>['enqueue']>>,
): string {
    const title = escapeDiscordFormatting(track.title);
    const trackDetails = `**${title}** (<${track.url}>) • ${formatDuration(track.durationMs)} • requested by <@${track.requestedBy.userId}>`;

    switch (result.status) {
        case 'started':
            return `Now playing ${trackDetails}`;
        case 'queued':
            return `Added ${trackDetails} to queue position ${result.position}`;
        case 'failed':
            return `Could not play ${trackDetails}`;
    }
}

function formatDuration(durationMs: number | null): string {
    if (durationMs === null) {
        return 'unknown duration';
    }

    const totalSeconds = Math.floor(durationMs / 1_000);
    const hours = Math.floor(totalSeconds / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;

    return hours > 0
        ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
