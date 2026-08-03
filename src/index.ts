import 'dotenv/config';

import { createDiscordClient } from './client/create-discord-client.js';
import { registerShutdownHandlers } from './client/shutdown.js';
import { commandRegistry } from './commands/index.js';
import { readEnvironment } from './config/environment.js';
import { registerInteractionHandler } from './interactions/register-interaction-handler.js';
import { logger } from './logger.js';

async function start(): Promise<void> {
    const environment = readEnvironment();
    const client = createDiscordClient(logger);

    registerInteractionHandler(client, commandRegistry, logger);
    registerShutdownHandlers(client, logger);
    await client.login(environment.discordToken);
}

start().catch((error: unknown) => {
    logger.fatal({ error }, 'Vox failed to start');
    process.exitCode = 1;
});
