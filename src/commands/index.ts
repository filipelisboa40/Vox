import { CommandRegistry } from './command-registry.js';
import { createPlayCommand, playCommandData } from './play/play-command.js';
import {
    createPauseCommand,
    createResumeCommand,
    pauseCommandData,
    resumeCommandData,
} from './playback/pause-resume-commands.js';
import { createStopCommand, stopCommandData } from './playback/stop-command.js';
import type { PlayerManager } from '../player/player-manager.js';
import type { ProviderManager } from '../providers/provider-manager.js';

// Commands are deliberately listed here so registration stays visible and reviewable.
export const commandDefinitions = [
    playCommandData,
    pauseCommandData,
    resumeCommandData,
    stopCommandData,
] as const;

export function createCommandRegistry(dependencies: {
    readonly players: PlayerManager;
    readonly providers: ProviderManager;
}): CommandRegistry {
    return new CommandRegistry([
        createPlayCommand({ players: dependencies.players, providers: dependencies.providers }),
        createPauseCommand({ players: dependencies.players }),
        createResumeCommand({ players: dependencies.players }),
        createStopCommand({ players: dependencies.players }),
    ]);
}
