import { SlashCommandBuilder } from 'discord.js';

import { VoiceAccessError } from '../../player/voice-access.js';
import { errorResponse, successResponse } from '../../utilities/command-response.js';
import type { Command } from '../command.js';
import {
    PlaybackControlError,
    resolvePlayback,
    type PlaybackResolverDependencies,
} from './resolve-playback.js';

export const pauseCommandData = new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pauses the current track');

export const resumeCommandData = new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resumes paused playback');

export function createPauseCommand(dependencies: PlaybackResolverDependencies): Command {
    return {
        data: pauseCommandData,
        execute: async (interaction) => {
            try {
                const playback = await resolvePlayback(interaction, dependencies);

                if (!playback.pause()) {
                    await interaction.reply(errorResponse('Playback is not currently playing'));
                    return;
                }

                await interaction.reply(successResponse('Playback paused'));
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

export function createResumeCommand(dependencies: PlaybackResolverDependencies): Command {
    return {
        data: resumeCommandData,
        execute: async (interaction) => {
            try {
                const playback = await resolvePlayback(interaction, dependencies);

                if (!playback.resume()) {
                    await interaction.reply(errorResponse('Playback is not paused'));
                    return;
                }

                await interaction.reply(successResponse('Playback resumed'));
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
