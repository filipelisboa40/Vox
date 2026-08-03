import type { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export interface Command {
    readonly data: SlashCommandBuilder;
    readonly deferReply?: boolean;
    readonly ephemeral?: boolean;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
