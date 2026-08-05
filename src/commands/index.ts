import { CommandRegistry } from './command-registry.js';
import {
    createNextCommand,
    createNowPlayingCommand,
    createQueueCommand,
    nextCommandData,
    nowPlayingCommandData,
    queueCommandData,
} from './information/queue-information-commands.js';
import { createPlayCommand, playCommandData } from './play/play-command.js';
import {
    clearCommandData,
    createClearCommand,
    createMoveCommand,
    createRemoveCommand,
    createShuffleCommand,
    moveCommandData,
    removeCommandData,
    shuffleCommandData,
} from './queue/queue-editing-commands.js';
import {
    createPauseCommand,
    createResumeCommand,
    pauseCommandData,
    resumeCommandData,
} from './playback/pause-resume-commands.js';
import { createStopCommand, stopCommandData } from './playback/stop-command.js';
import { createDisconnectCommand, disconnectCommandData } from './playback/disconnect-command.js';
import {
    createLoopCommand,
    createLoopQueueCommand,
    loopCommandData,
    loopQueueCommandData,
} from './playback/loop-commands.js';
import {
    createAbsoluteSeekCommand,
    createForwardSeekCommand,
    createReplayCommand,
    forwardSeekCommandData,
    replayCommandData,
    seekCommandData,
} from './playback/seek-commands.js';
import {
    createSkipCommand,
    createUnskipCommand,
    skipCommandData,
    unskipCommandData,
} from './playback/skip-unskip-commands.js';
import type { PlayerManager } from '../player/player-manager.js';
import type { ProviderManager } from '../providers/provider-manager.js';

// Commands are deliberately listed here so registration stays visible and reviewable.
export const commandDefinitions = [
    playCommandData,
    pauseCommandData,
    resumeCommandData,
    stopCommandData,
    skipCommandData,
    unskipCommandData,
    nowPlayingCommandData,
    nextCommandData,
    queueCommandData,
    replayCommandData,
    seekCommandData,
    forwardSeekCommandData,
    clearCommandData,
    removeCommandData,
    moveCommandData,
    shuffleCommandData,
    loopCommandData,
    loopQueueCommandData,
    disconnectCommandData,
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
        createSkipCommand({ players: dependencies.players }),
        createUnskipCommand({ players: dependencies.players }),
        createNowPlayingCommand({ players: dependencies.players }),
        createNextCommand({ players: dependencies.players }),
        createQueueCommand({ players: dependencies.players }),
        createReplayCommand({ players: dependencies.players }),
        createAbsoluteSeekCommand({ players: dependencies.players }),
        createForwardSeekCommand({ players: dependencies.players }),
        createClearCommand({ players: dependencies.players }),
        createRemoveCommand({ players: dependencies.players }),
        createMoveCommand({ players: dependencies.players }),
        createShuffleCommand({ players: dependencies.players }),
        createLoopCommand({ players: dependencies.players }),
        createLoopQueueCommand({ players: dependencies.players }),
        createDisconnectCommand({ players: dependencies.players }),
    ]);
}
