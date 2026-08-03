import 'dotenv/config';

import { createDiscordClient } from './client/create-discord-client.js';
import { registerShutdownHandlers } from './client/shutdown.js';
import { createCommandRegistry } from './commands/index.js';
import { readEnvironment } from './config/environment.js';
import { registerInteractionHandler } from './interactions/register-interaction-handler.js';
import { logger } from './logger.js';
import { PlayerManager, createManagedGuildPlayerFactory } from './player/player-manager.js';
import { createProviderManager } from './providers/index.js';

async function start(): Promise<void> {
    const environment = readEnvironment();
    const client = createDiscordClient(logger);
    const providerManager = createProviderManager(environment);
    const playerManager = new PlayerManager(
        logger,
        createManagedGuildPlayerFactory(logger, providerManager),
    );
    const commandRegistry = createCommandRegistry({
        players: playerManager,
        providers: providerManager,
    });

    registerInteractionHandler(client, commandRegistry, logger);
    registerShutdownHandlers(client, logger, () => playerManager.destroyAll());
    await client.login(environment.discordToken);
}

start().catch((error: unknown) => {
    logger.fatal({ error }, 'Vox failed to start');
    process.exitCode = 1;
});
