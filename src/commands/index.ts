import { CommandRegistry } from './command-registry.js';
import { createPlayCommand, playCommandData } from './play/play-command.js';
import type { PlayerManager } from '../player/player-manager.js';
import type { ProviderManager } from '../providers/provider-manager.js';

// Commands are deliberately listed here so registration stays visible and reviewable.
export const commandDefinitions = [playCommandData] as const;

export function createCommandRegistry(dependencies: {
    readonly players: PlayerManager;
    readonly providers: ProviderManager;
}): CommandRegistry {
    return new CommandRegistry([
        createPlayCommand({ players: dependencies.players, providers: dependencies.providers }),
    ]);
}
