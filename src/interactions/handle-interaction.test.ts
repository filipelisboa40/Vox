import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    type Interaction,
} from 'discord.js';
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import type { Command } from '../commands/command.js';
import { CommandRegistry } from '../commands/command-registry.js';
import { handleInteraction } from './handle-interaction.js';
import { KeyedOperationQueue } from '../utilities/keyed-operation-queue.js';

interface InteractionFixture {
    interaction: Interaction;
    reply: ReturnType<typeof vi.fn>;
    editReply: ReturnType<typeof vi.fn>;
    followUp: ReturnType<typeof vi.fn>;
    deferReply: ReturnType<typeof vi.fn>;
}

function createInteraction(
    commandName: string,
    deferred = false,
    guildId: string | null = null,
): InteractionFixture {
    const reply = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const followUp = vi.fn().mockResolvedValue(undefined);
    const deferReply = vi.fn().mockResolvedValue(undefined);

    const interaction = {
        id: 'interaction-id',
        commandName,
        deferred,
        replied: false,
        guildId,
        isChatInputCommand: () => true,
        isRepliable: () => true,
        reply,
        editReply,
        followUp,
        deferReply,
    } as unknown as Interaction;

    return { interaction, reply, editReply, followUp, deferReply };
}

function createLogger(): { logger: Logger; warn: ReturnType<typeof vi.fn> } {
    const warn = vi.fn();
    const logger = { warn, error: vi.fn() } as unknown as Logger;
    return { logger, warn };
}

function createCommand(execute: Command['execute'], deferReply = false): Command {
    return {
        data: new SlashCommandBuilder().setName('test').setDescription('Test command'),
        deferReply,
        execute,
    };
}

describe('handleInteraction', () => {
    it('routes a registered chat-input command to its handler', async () => {
        const execute = vi.fn().mockResolvedValue(undefined);
        const fixture = createInteraction('test');
        const { logger } = createLogger();

        await handleInteraction(
            fixture.interaction,
            new CommandRegistry([createCommand(execute)]),
            logger,
        );

        expect(execute).toHaveBeenCalledWith(fixture.interaction as ChatInputCommandInteraction);
    });

    it('defers commands that declare they may take longer', async () => {
        const fixture = createInteraction('test');
        const { logger } = createLogger();

        await handleInteraction(
            fixture.interaction,
            new CommandRegistry([createCommand(vi.fn().mockResolvedValue(undefined), true)]),
            logger,
        );

        expect(fixture.deferReply).toHaveBeenCalledOnce();
    });

    it('serializes simultaneous state-changing commands in one guild', async () => {
        const first = createInteraction('test', false, 'guild-id');
        const second = createInteraction('test', false, 'guild-id');
        const { logger } = createLogger();
        const events: string[] = [];
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const execute = vi
            .fn()
            .mockImplementationOnce(async () => {
                events.push('play-start');
                await gate;
                events.push('play-end');
            })
            .mockImplementationOnce(() => {
                events.push('skip');
                return Promise.resolve();
            });
        const registry = new CommandRegistry([createCommand(execute)]);
        const queue = new KeyedOperationQueue();

        const play = handleInteraction(first.interaction, registry, logger, queue);
        const skip = handleInteraction(second.interaction, registry, logger, queue);
        await vi.waitFor(() => expect(events).toEqual(['play-start']));
        release();
        await Promise.all([play, skip]);

        expect(events).toEqual(['play-start', 'play-end', 'skip']);
    });

    it('replies safely when a command fails before responding', async () => {
        const fixture = createInteraction('test');
        const { logger } = createLogger();
        const execute = vi.fn().mockRejectedValue(new Error('private failure details'));

        await handleInteraction(
            fixture.interaction,
            new CommandRegistry([createCommand(execute)]),
            logger,
        );

        expect(fixture.reply).toHaveBeenCalledOnce();
        expect(JSON.stringify(fixture.reply.mock.calls)).not.toContain('private failure details');
    });

    it('edits the original response when a deferred command fails', async () => {
        const fixture = createInteraction('test', true);
        const { logger } = createLogger();
        const execute = vi.fn().mockRejectedValue(new Error('failure'));

        await handleInteraction(
            fixture.interaction,
            new CommandRegistry([createCommand(execute)]),
            logger,
        );

        expect(fixture.editReply).toHaveBeenCalledOnce();
        expect(fixture.reply).not.toHaveBeenCalled();
    });

    it('logs unknown commands and responds without throwing', async () => {
        const fixture = createInteraction('unknown');
        const { logger, warn } = createLogger();

        await handleInteraction(fixture.interaction, new CommandRegistry([]), logger);

        expect(warn).toHaveBeenCalledOnce();
        expect(fixture.reply).toHaveBeenCalledOnce();
    });

    it('ignores interactions that are not chat-input commands', async () => {
        const interaction = { isChatInputCommand: () => false } as Interaction;
        const { logger, warn } = createLogger();

        await handleInteraction(interaction, new CommandRegistry([]), logger);

        expect(warn).not.toHaveBeenCalled();
    });
});
