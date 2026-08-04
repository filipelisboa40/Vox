import { SlashCommandBuilder } from 'discord.js';

import { VoiceAccessError } from '../../player/voice-access.js';
import type { Command } from '../command.js';
import { errorResponse, successResponse } from '../../utilities/command-response.js';
import {
    PlaybackControlError,
    resolvePlayback,
    type PlaybackResolverDependencies,
} from './resolve-playback.js';

export const skipCommandData = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skips the current track');

export const unskipCommandData = new SlashCommandBuilder()
    .setName('unskip')
    .setDescription('Restores the most recently skipped track when possible');

export function createSkipCommand(dependencies: PlaybackResolverDependencies): Command {
    return {
        data: skipCommandData,
        execute: async (interaction) => {
            try {
                const result = await (await resolvePlayback(interaction, dependencies)).skip();

                if (result.status === 'nothing-playing') {
                    await interaction.reply(
                        errorResponse('Nothing is currently playing in this server'),
                    );
                    return;
                }

                await interaction.reply(
                    successResponse(
                        result.next === undefined
                            ? `Skipped **${result.skipped.title}**; the queue is now empty`
                            : `Skipped **${result.skipped.title}**; now playing **${result.next.title}**`,
                    ),
                );
            } catch (error: unknown) {
                await replyWithPlaybackError(interaction, error);
            }
        },
    };
}

export function createUnskipCommand(dependencies: PlaybackResolverDependencies): Command {
    return {
        data: unskipCommandData,
        execute: async (interaction) => {
            try {
                const result = await (await resolvePlayback(interaction, dependencies)).unskip();

                if (result.status === 'nothing-to-unskip') {
                    await interaction.reply(errorResponse('There is no skipped track to restore'));
                    return;
                }

                if (result.status === 'failed') {
                    await interaction.reply(
                        errorResponse('The skipped track could not be restored'),
                    );
                    return;
                }

                await interaction.reply(successResponse(`Restored **${result.track.title}**`));
            } catch (error: unknown) {
                await replyWithPlaybackError(interaction, error);
            }
        },
    };
}

async function replyWithPlaybackError(
    interaction: Parameters<Command['execute']>[0],
    error: unknown,
): Promise<void> {
    if (error instanceof PlaybackControlError || error instanceof VoiceAccessError) {
        await interaction.reply(errorResponse(error.message));
        return;
    }

    throw error;
}
