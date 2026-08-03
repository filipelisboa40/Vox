import { Events, type Client } from 'discord.js';
import type { Logger } from 'pino';

import type { CommandRegistry } from '../commands/command-registry.js';
import { handleInteraction } from './handle-interaction.js';

export function registerInteractionHandler(
    client: Client,
    commandRegistry: CommandRegistry,
    logger: Logger,
): void {
    client.on(Events.InteractionCreate, (interaction) => {
        void handleInteraction(interaction, commandRegistry, logger).catch((error: unknown) => {
            logger.error({ error, interactionId: interaction.id }, 'Interaction handling failed');
        });
    });
}
