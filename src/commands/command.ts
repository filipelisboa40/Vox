import type {
    ChatInputCommandInteraction,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

export interface CommandData {
    readonly name: string;
    toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
}

export interface Command {
    readonly data: CommandData;
    readonly deferReply?: boolean;
    readonly ephemeral?: boolean;
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
