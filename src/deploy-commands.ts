import 'dotenv/config';

import { REST, Routes } from 'discord.js';

import { commandRegistry } from './commands/index.js';
import { readEnvironment } from './config/environment.js';
import { logger } from './logger.js';

async function deployCommands(): Promise<void> {
    const environment = readEnvironment();
    const commandBodies = commandRegistry.toJSON();

    if (commandBodies.length === 0) {
        throw new Error(
            'No commands are registered; refusing to replace Discord commands with an empty list',
        );
    }

    const rest = new REST().setToken(environment.discordToken);
    const deployGlobally = process.argv.includes('--global');
    const guildId = deployGlobally ? undefined : environment.discordGuildId;
    const route =
        guildId === undefined
            ? Routes.applicationCommands(environment.discordClientId)
            : Routes.applicationGuildCommands(environment.discordClientId, guildId);

    logger.info(
        { commandCount: commandBodies.length, scope: guildId === undefined ? 'global' : 'guild' },
        'Deploying Discord commands',
    );

    await rest.put(route, { body: commandBodies });
    logger.info('Discord commands deployed successfully');
}

deployCommands().catch((error: unknown) => {
    logger.fatal({ error }, 'Discord command deployment failed');
    process.exitCode = 1;
});
