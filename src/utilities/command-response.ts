import { EmbedBuilder } from 'discord.js';

export interface CommandResponse {
    readonly embeds: [EmbedBuilder];
}

export enum ResponseKind {
    Success = 0x57_f2_87,
    Information = 0x58_65_f2,
    Error = 0xed_42_45,
}

export function commandResponse(
    kind: ResponseKind,
    description: string,
    title?: string,
): CommandResponse {
    const embed = new EmbedBuilder().setColor(kind).setDescription(description);

    if (title !== undefined) {
        embed.setTitle(title);
    }

    return { embeds: [embed] };
}

export const successResponse = (description: string): CommandResponse =>
    commandResponse(ResponseKind.Success, description, 'Success');

export const informationResponse = (description: string): CommandResponse =>
    commandResponse(ResponseKind.Information, description, 'Information');

export const errorResponse = (description: string): CommandResponse =>
    commandResponse(ResponseKind.Error, description, 'Unable to complete command');
