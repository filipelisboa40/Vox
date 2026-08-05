import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

import { LoopMode } from '../../models/playback-state.js';
import type { Track } from '../../models/track.js';
import type { PlaybackController } from '../../player/playback-controller.js';
import type { PlayerManager } from '../../player/player-manager.js';
import {
    formatDuration,
    formatProgress,
    formatTrackTitle,
    sumKnownDurations,
} from '../../utilities/playback-format.js';
import type { Command } from '../command.js';
import {
    errorResponse,
    informationResponse,
    ResponseKind,
} from '../../utilities/command-response.js';

const tracksPerPage = 10;

export interface QueueInformationDependencies {
    readonly players: Pick<PlayerManager, 'get'>;
}

export const nowPlayingCommandData = new SlashCommandBuilder()
    .setName('now-playing')
    .setDescription('Shows information about the current track');
export const nextCommandData = new SlashCommandBuilder()
    .setName('next')
    .setDescription('Shows the next queued track');
export const queueCommandData = new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Displays the current queue')
    .addIntegerOption((option) =>
        option.setName('page').setDescription('Queue page to display').setMinValue(1),
    );

export function createNowPlayingCommand(dependencies: QueueInformationDependencies): Command {
    return {
        data: nowPlayingCommandData,
        execute: async (interaction) => {
            const playback = findPlayback(interaction, dependencies);
            const track = playback?.currentTrack;

            if (playback === undefined || track === undefined) {
                await interaction.reply(
                    errorResponse('Nothing is currently playing in this server'),
                );
                return;
            }

            const positionMs = playback.playbackPositionMs;
            const embed = new EmbedBuilder()
                .setColor(ResponseKind.Information)
                .setTitle('Now playing')
                .setDescription(`**${formatTrackTitle(track, 256)}**\n<${track.url}>`)
                .addFields(
                    {
                        name: 'Progress',
                        value: `${formatProgress(positionMs, track.durationMs)}\n${formatDuration(positionMs)} / ${formatDuration(track.durationMs)}`,
                    },
                    { name: 'Requested by', value: `<@${track.requestedBy.userId}>`, inline: true },
                    { name: 'Loop', value: formatLoopMode(playback.loopMode), inline: true },
                );

            if (track.thumbnailUrl !== undefined) embed.setThumbnail(track.thumbnailUrl);
            await interaction.reply({ embeds: [embed] });
        },
    };
}

export function createNextCommand(dependencies: QueueInformationDependencies): Command {
    return {
        data: nextCommandData,
        execute: async (interaction) => {
            const playback = findPlayback(interaction, dependencies);
            const next = playback?.queue.peek();

            if (playback === undefined || next === undefined) {
                await interaction.reply(errorResponse('The queue is empty'));
                return;
            }

            await interaction.reply(
                informationResponse(
                    `Next: **${formatTrackTitle(next)}** (<${next.url}>) • ${formatDuration(next.durationMs)} • starts in ${formatDuration(estimateCurrentRemaining(playback))}`,
                ),
            );
        },
    };
}

export function createQueueCommand(dependencies: QueueInformationDependencies): Command {
    return {
        data: queueCommandData,
        execute: async (interaction) => {
            const playback = findPlayback(interaction, dependencies);
            const tracks = playback?.queue.snapshot() ?? [];

            if (playback === undefined || tracks.length === 0) {
                await interaction.reply(errorResponse('The queue is empty'));
                return;
            }

            const page = interaction.options.getInteger('page') ?? 1;
            const pageCount = Math.ceil(tracks.length / tracksPerPage);

            if (page > pageCount) {
                await interaction.reply(errorResponse(`Queue page ${page} does not exist`));
                return;
            }

            const start = (page - 1) * tracksPerPage;
            const pageTracks = tracks.slice(start, start + tracksPerPage);
            const lines = formatQueueLines(
                pageTracks,
                start,
                tracks.slice(0, start),
                estimateCurrentRemaining(playback),
            );
            const embed = new EmbedBuilder()
                .setColor(ResponseKind.Information)
                .setTitle('Queue')
                .setDescription(lines.join('\n'))
                .setFooter({
                    text: `Page ${page}/${pageCount} • ${tracks.length} queued • ${formatDuration(sumKnownDurations(tracks))} total`,
                });

            await interaction.reply({ embeds: [embed] });
        },
    };
}

function findPlayback(
    interaction: ChatInputCommandInteraction,
    dependencies: QueueInformationDependencies,
): PlaybackController | undefined {
    return interaction.guildId === null
        ? undefined
        : dependencies.players.get(interaction.guildId)?.playback;
}

function estimateCurrentRemaining(playback: PlaybackController): number | null {
    const durationMs = playback.currentTrack?.durationMs;
    return durationMs === null || durationMs === undefined
        ? null
        : Math.max(0, durationMs - playback.playbackPositionMs);
}

function formatQueueLines(
    tracks: readonly Track[],
    startIndex: number,
    precedingTracks: readonly Track[],
    initialWaitMs: number | null,
): string[] {
    const precedingDuration = sumKnownDurations(precedingTracks);
    let waitMs =
        initialWaitMs === null || precedingDuration === null
            ? null
            : initialWaitMs + precedingDuration;

    return tracks.map((track, index) => {
        const line = `${startIndex + index + 1}. **${formatTrackTitle(track)}** • ${formatDuration(track.durationMs)} • <@${track.requestedBy.userId}> • starts in ${formatDuration(waitMs)}`;
        if (waitMs !== null) waitMs = track.durationMs === null ? null : waitMs + track.durationMs;
        return line;
    });
}

function formatLoopMode(loopMode: LoopMode): string {
    switch (loopMode) {
        case LoopMode.Off:
            return 'Off';
        case LoopMode.Track:
            return 'Track';
        case LoopMode.Queue:
            return 'Queue';
    }
}
