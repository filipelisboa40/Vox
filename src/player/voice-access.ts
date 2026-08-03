import { PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';

export interface VoiceJoinTarget {
    readonly guildId: string;
    readonly voiceChannelId: string;
    readonly adapterCreator: DiscordGatewayAdapterCreator;
}

export class VoiceAccessError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'VoiceAccessError';
    }
}

export async function resolveVoiceJoinTarget(
    interaction: ChatInputCommandInteraction,
): Promise<VoiceJoinTarget> {
    if (!interaction.inCachedGuild()) {
        throw new VoiceAccessError('This command can only be used in a Discord server');
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voiceChannel = member.voice.channel;

    if (voiceChannel === null) {
        throw new VoiceAccessError('Join a voice channel before using this command');
    }

    const botMember = interaction.guild.members.me;

    if (botMember === null) {
        throw new VoiceAccessError('The bot is not available in this Discord server');
    }

    const permissions = voiceChannel.permissionsFor(botMember);

    if (!permissions.has(PermissionFlagsBits.Connect)) {
        throw new VoiceAccessError('The bot does not have permission to join your voice channel');
    }

    if (!permissions.has(PermissionFlagsBits.Speak)) {
        throw new VoiceAccessError(
            'The bot does not have permission to speak in your voice channel',
        );
    }

    return {
        guildId: interaction.guildId,
        voiceChannelId: voiceChannel.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
    };
}
