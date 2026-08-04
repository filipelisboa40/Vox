import { Events, type Client } from 'discord.js';
import type { Logger } from 'pino';

import type { CommandRegistry } from '../commands/command-registry.js';
import { handleInteraction } from './handle-interaction.js';
import { KeyedOperationQueue } from '../utilities/keyed-operation-queue.js';

export function registerInteractionHandler(
    client: Client,
    commandRegistry: CommandRegistry,
    logger: Logger,
): void {
    const operationQueue = new KeyedOperationQueue();

    client.on(Events.InteractionCreate, (interaction) => {
        void handleInteraction(interaction, commandRegistry, logger, operationQueue).catch(
            (error: unknown) => {
                logger.error(
                    { error, interactionId: interaction.id },
                    'Interaction handling failed',
                );
            },
        );
    });
}
