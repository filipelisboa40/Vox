import type { Client } from 'discord.js';
import type { Logger } from 'pino';

const shutdownSignals = ['SIGINT', 'SIGTERM'] as const;

export function registerShutdownHandlers(client: Client, logger: Logger): void {
    let isShuttingDown = false;

    const shutdown = async (signal: (typeof shutdownSignals)[number]): Promise<void> => {
        if (isShuttingDown) {
            return;
        }

        isShuttingDown = true;
        logger.info({ signal }, 'Shutting down Discord client');
        await client.destroy();
    };

    for (const signal of shutdownSignals) {
        process.once(signal, () => {
            void shutdown(signal).catch((error: unknown) => {
                logger.error({ error, signal }, 'Discord client shutdown failed');
                process.exitCode = 1;
            });
        });
    }
}
