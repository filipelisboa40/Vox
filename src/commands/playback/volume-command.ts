import { SlashCommandBuilder } from 'discord.js';

import type { PlayerManager } from '../../player/player-manager.js';
import { VoiceAccessError, resolveVoiceJoinTarget } from '../../player/voice-access.js';
import type { Command } from '../command.js';

export const volumeCommandData = new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Changes the current player volume')
    .addIntegerOption((option) =>
        option
            .setName('level')
            .setDescription('Volume from 0 through 100')
            .setMinValue(0)
            .setMaxValue(100)
            .setRequired(true),
    );

export function createVolumeCommand(dependencies: {
    readonly players: Pick<PlayerManager, 'get'>;
    readonly resolveVoiceTarget?: typeof resolveVoiceJoinTarget;
}): Command {
    return {
        data: volumeCommandData,
        execute: async (interaction) => {
            try {
                const target = await (dependencies.resolveVoiceTarget ?? resolveVoiceJoinTarget)(
                    interaction,
                );
                const player = dependencies.players.get(target.guildId);

                if (player === undefined || player.playback === undefined) {
                    await interaction.reply('Nothing is currently playing in this server');
                    return;
                }

                if (player.voiceChannelId !== target.voiceChannelId) {
                    await interaction.reply("Join the bot's voice channel to control playback");
                    return;
                }

                const level = interaction.options.getInteger('level', true);

                if (!Number.isInteger(level) || level < 0 || level > 100) {
                    await interaction.reply('Volume must be an integer from 0 through 100');
                    return;
                }

                player.setVolume(level / 100);
                await interaction.reply(
                    level === 0
                        ? 'Volume set to 0% (playback is muted, not paused)'
                        : `Volume set to ${level}%`,
                );
            } catch (error: unknown) {
                if (error instanceof VoiceAccessError) {
                    await interaction.reply(error.message);
                    return;
                }

                throw error;
            }
        },
    };
}
