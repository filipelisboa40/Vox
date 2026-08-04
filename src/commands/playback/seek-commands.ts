import { SlashCommandBuilder } from 'discord.js';

import { VoiceAccessError } from '../../player/voice-access.js';
import { formatDuration } from '../../utilities/playback-format.js';
import { InvalidSeekPositionError, parseSeekPosition } from '../../utilities/seek-position.js';
import type { Command } from '../command.js';
import {
    PlaybackControlError,
    resolvePlayback,
    type PlaybackResolverDependencies,
} from './resolve-playback.js';

export const replayCommandData = new SlashCommandBuilder()
    .setName('replay')
    .setDescription('Restarts the current track');
export const seekCommandData = new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Moves to an absolute position in the current track')
    .addStringOption((option) =>
        option.setName('position').setDescription('Seconds, MM:SS, or HH:MM:SS').setRequired(true),
    );
export const forwardSeekCommandData = new SlashCommandBuilder()
    .setName('fseek')
    .setDescription('Moves forward or backward by a number of seconds')
    .addIntegerOption((option) =>
        option.setName('amount').setDescription('Signed number of seconds').setRequired(true),
    );

export function createReplayCommand(dependencies: PlaybackResolverDependencies): Command {
    return createSeekCommand(replayCommandData, dependencies, async (interaction, playback) => {
        const result = await playback.replay();
        await replyForSeekResult(interaction, result, 'Replaying the current track');
    });
}

export function createAbsoluteSeekCommand(dependencies: PlaybackResolverDependencies): Command {
    return createSeekCommand(seekCommandData, dependencies, async (interaction, playback) => {
        const positionMs = parseSeekPosition(interaction.options.getString('position', true));
        const result = await playback.seek(positionMs);
        await replyForSeekResult(
            interaction,
            result,
            `Moved playback to ${formatDuration(positionMs)}`,
        );
    });
}

export function createForwardSeekCommand(dependencies: PlaybackResolverDependencies): Command {
    return createSeekCommand(
        forwardSeekCommandData,
        dependencies,
        async (interaction, playback) => {
            const amountMs = interaction.options.getInteger('amount', true) * 1_000;
            const result = await playback.seekRelative(amountMs);
            await replyForSeekResult(
                interaction,
                result,
                result.status === 'seeked'
                    ? `Moved playback to ${formatDuration(result.positionMs)}`
                    : 'Playback position was not changed',
            );
        },
    );
}

function createSeekCommand(
    data: Command['data'],
    dependencies: PlaybackResolverDependencies,
    execute: (
        interaction: Parameters<Command['execute']>[0],
        playback: Awaited<ReturnType<typeof resolvePlayback>>,
    ) => Promise<void>,
): Command {
    return {
        data,
        execute: async (interaction) => {
            try {
                await execute(interaction, await resolvePlayback(interaction, dependencies));
            } catch (error: unknown) {
                if (
                    error instanceof PlaybackControlError ||
                    error instanceof VoiceAccessError ||
                    error instanceof InvalidSeekPositionError
                ) {
                    await interaction.reply(error.message);
                    return;
                }

                throw error;
            }
        },
    };
}

async function replyForSeekResult(
    interaction: Parameters<Command['execute']>[0],
    result: Awaited<ReturnType<Awaited<ReturnType<typeof resolvePlayback>>['seek']>>,
    successMessage: string,
): Promise<void> {
    switch (result.status) {
        case 'seeked':
            await interaction.reply(successMessage);
            return;
        case 'nothing-playing':
            await interaction.reply('Nothing is currently playing in this server');
            return;
        case 'unsupported':
            await interaction.reply('The current provider does not support seeking this track');
            return;
        case 'out-of-range':
            await interaction.reply('The requested position is outside the current track');
            return;
        case 'failed':
            await interaction.reply('Playback could not be moved to the requested position');
    }
}
