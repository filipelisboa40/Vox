import { Client, Events, GatewayIntentBits } from 'discord.js';
import type { Logger } from 'pino';

export function createDiscordClient(logger: Logger): Client {
    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    });

    client.once(Events.ClientReady, (readyClient) => {
        logger.info(
            { botUserId: readyClient.user.id, botUsername: readyClient.user.username },
            'Discord client is ready',
        );
    });

    client.on(Events.Warn, (message) => {
        logger.warn({ message }, 'Discord client warning');
    });

    client.on(Events.Error, (error) => {
        logger.error({ error }, 'Discord client error');
    });

    return client;
}
