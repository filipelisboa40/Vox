import { SlashCommandBuilder } from 'discord.js';

import { LoopMode } from '../../models/playback-state.js';
import { VoiceAccessError } from '../../player/voice-access.js';
import { errorResponse, successResponse } from '../../utilities/command-response.js';
import type { Command } from '../command.js';
import {
    PlaybackControlError,
    resolvePlayback,
    type PlaybackResolverDependencies,
} from './resolve-playback.js';

export const loopCommandData = new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Toggles looping for the current track');
export const loopQueueCommandData = new SlashCommandBuilder()
    .setName('loop-queue')
    .setDescription('Toggles looping for the complete queue');

export function createLoopCommand(dependencies: PlaybackResolverDependencies): Command {
    return createLoopToggleCommand(loopCommandData, dependencies, 'track');
}

export function createLoopQueueCommand(dependencies: PlaybackResolverDependencies): Command {
    return createLoopToggleCommand(loopQueueCommandData, dependencies, 'queue');
}

function createLoopToggleCommand(
    data: Command['data'],
    dependencies: PlaybackResolverDependencies,
    mode: 'track' | 'queue',
): Command {
    return {
        data,
        execute: async (interaction) => {
            try {
                const playback = await resolvePlayback(interaction, dependencies);
                const result =
                    mode === 'track' ? playback.toggleTrackLoop() : playback.toggleQueueLoop();
                const enabled = result !== LoopMode.Off;
                await interaction.reply(
                    successResponse(
                        `${mode === 'track' ? 'Track' : 'Queue'} loop ${enabled ? 'enabled' : 'disabled'}`,
                    ),
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
