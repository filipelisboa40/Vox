import { SlashCommandBuilder } from 'discord.js';

import { VoiceAccessError } from '../../player/voice-access.js';
import { errorResponse, successResponse } from '../../utilities/command-response.js';
import type { Command } from '../command.js';
import {
    PlaybackControlError,
    resolvePlayback,
    type PlaybackResolverDependencies,
} from './resolve-playback.js';

export const stopCommandData = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stops playback and clears the queue');

export function createStopCommand(dependencies: PlaybackResolverDependencies): Command {
    return {
        data: stopCommandData,
        execute: async (interaction) => {
            try {
                const playback = await resolvePlayback(interaction, dependencies);

                if (!(await playback.stop())) {
                    await interaction.reply(
                        errorResponse('Nothing is currently playing in this server'),
                    );
                    return;
                }

                await interaction.reply(
                    successResponse('Playback stopped and the queue was cleared'),
                );
            } catch (error: unknown) {
                if (error instanceof PlaybackControlError || error instanceof VoiceAccessError) {
                    await interaction.reply(errorResponse(error.message));
                    return;
                }

                throw error;
            }
        },
    };
}
