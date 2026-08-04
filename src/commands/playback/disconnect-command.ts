import { SlashCommandBuilder } from 'discord.js';

import type { PlayerManager } from '../../player/player-manager.js';
import { resolveVoiceJoinTarget, VoiceAccessError } from '../../player/voice-access.js';
import type { Command } from '../command.js';
import { errorResponse, successResponse } from '../../utilities/command-response.js';
import { PlaybackControlError, type VoiceTargetResolver } from './resolve-playback.js';

export const disconnectCommandData = new SlashCommandBuilder()
    .setName('disconnect')
    .setDescription('Stops playback and disconnects the bot from voice');

export interface DisconnectCommandDependencies {
    readonly players: Pick<PlayerManager, 'destroy' | 'get'>;
    readonly resolveVoiceTarget?: VoiceTargetResolver;
}

export function createDisconnectCommand(dependencies: DisconnectCommandDependencies): Command {
    return {
        data: disconnectCommandData,
        execute: async (interaction) => {
            try {
                const voiceTarget = await (
                    dependencies.resolveVoiceTarget ?? resolveVoiceJoinTarget
                )(interaction);
                const player = dependencies.players.get(voiceTarget.guildId);

                if (player === undefined) {
                    throw new PlaybackControlError('The bot is not connected in this server');
                }

                if (player.voiceChannelId !== voiceTarget.voiceChannelId) {
                    throw new PlaybackControlError(
                        "Join the bot's voice channel to control playback",
                    );
                }

                await dependencies.players.destroy(voiceTarget.guildId);
                const botName = interaction.client.user?.username ?? 'The bot';
                await interaction.reply(
                    successResponse(`${botName} disconnected from the voice channel`),
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
