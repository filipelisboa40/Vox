import { MessageFlags, type Interaction } from 'discord.js';
import type { Logger } from 'pino';

import type { CommandRegistry } from '../commands/command-registry.js';

const genericErrorMessage = 'The command could not be completed. Please try again.';

export async function handleInteraction(
    interaction: Interaction,
    commandRegistry: CommandRegistry,
    logger: Logger,
): Promise<void> {
    if (!interaction.isChatInputCommand()) {
        return;
    }

    const command = commandRegistry.get(interaction.commandName);

    if (command === undefined) {
        logger.warn(
            { commandName: interaction.commandName, interactionId: interaction.id },
            'Received an unregistered command',
        );
        await sendErrorResponse(interaction, 'This command is not currently available.');
        return;
    }

    try {
        if (command.deferReply === true && !interaction.deferred && !interaction.replied) {
            await interaction.deferReply({
                flags: command.ephemeral === true ? MessageFlags.Ephemeral : undefined,
            });
        }

        await command.execute(interaction);
    } catch (error: unknown) {
        logger.error(
            { commandName: interaction.commandName, error, interactionId: interaction.id },
            'Command execution failed',
        );
        await sendErrorResponse(interaction, genericErrorMessage);
    }
}

async function sendErrorResponse(interaction: Interaction, content: string): Promise<void> {
    if (!interaction.isRepliable()) {
        return;
    }

    if (interaction.deferred) {
        await interaction.editReply({ content });
        return;
    }

    if (interaction.replied) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
