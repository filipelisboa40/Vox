import { SlashCommandBuilder } from 'discord.js';

import { VoiceAccessError } from '../../player/voice-access.js';
import { formatTrackTitle } from '../../utilities/playback-format.js';
import type { Command } from '../command.js';
import {
    PlaybackControlError,
    resolvePlayback,
    type PlaybackResolverDependencies,
} from '../playback/resolve-playback.js';

export const clearCommandData = new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Removes every queued track except the currently playing one');
export const removeCommandData = new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Removes a selected track from the queue')
    .addIntegerOption((option) =>
        option
            .setName('position')
            .setDescription('One-based queue position')
            .setMinValue(1)
            .setRequired(true),
    );
export const moveCommandData = new SlashCommandBuilder()
    .setName('move')
    .setDescription('Moves a queued track to another position')
    .addIntegerOption((option) =>
        option
            .setName('from')
            .setDescription('Current one-based queue position')
            .setMinValue(1)
            .setRequired(true),
    )
    .addIntegerOption((option) =>
        option
            .setName('to')
            .setDescription('New one-based queue position')
            .setMinValue(1)
            .setRequired(true),
    );
export const shuffleCommandData = new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Randomizes the waiting queue');

export function createClearCommand(dependencies: PlaybackResolverDependencies): Command {
    return createQueueEditingCommand(
        clearCommandData,
        dependencies,
        async (interaction, playback) => {
            const removed = playback.queue.clearWaiting();
            await interaction.reply(
                removed.length === 0
                    ? 'The queue is already empty'
                    : `Removed ${removed.length} ${removed.length === 1 ? 'track' : 'tracks'} from the queue`,
            );
        },
    );
}

export function createRemoveCommand(dependencies: PlaybackResolverDependencies): Command {
    return createQueueEditingCommand(
        removeCommandData,
        dependencies,
        async (interaction, playback) => {
            const position = interaction.options.getInteger('position', true);
            const result = playback.queue.removePosition(position);

            switch (result.status) {
                case 'empty':
                    await interaction.reply('The queue is empty');
                    return;
                case 'out-of-range':
                    await interaction.reply(`Queue position ${position} does not exist`);
                    return;
                case 'removed':
                    await interaction.reply(
                        `Removed **${formatTrackTitle(result.track)}** from queue position ${position}`,
                    );
            }
        },
    );
}

export function createMoveCommand(dependencies: PlaybackResolverDependencies): Command {
    return createQueueEditingCommand(
        moveCommandData,
        dependencies,
        async (interaction, playback) => {
            const from = interaction.options.getInteger('from', true);
            const to = interaction.options.getInteger('to', true);
            const result = playback.queue.movePosition(from, to);

            switch (result.status) {
                case 'empty':
                    await interaction.reply('The queue is empty');
                    return;
                case 'out-of-range':
                    await interaction.reply('One or both queue positions do not exist');
                    return;
                case 'unchanged':
                    await interaction.reply(
                        `**${formatTrackTitle(result.track)}** is already at ${from}`,
                    );
                    return;
                case 'moved':
                    await interaction.reply(
                        `Moved **${formatTrackTitle(result.track)}** from position ${from} to ${to}`,
                    );
            }
        },
    );
}

export function createShuffleCommand(dependencies: PlaybackResolverDependencies): Command {
    return createQueueEditingCommand(
        shuffleCommandData,
        dependencies,
        async (interaction, playback) => {
            if (!playback.queue.shuffle()) {
                await interaction.reply('At least two queued tracks are required to shuffle');
                return;
            }

            await interaction.reply(`Shuffled ${playback.queue.size} queued tracks`);
        },
    );
}

function createQueueEditingCommand(
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
                if (error instanceof PlaybackControlError || error instanceof VoiceAccessError) {
                    await interaction.reply(error.message);
                    return;
                }

                throw error;
            }
        },
    };
}
