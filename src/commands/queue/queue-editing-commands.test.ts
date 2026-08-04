import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { QueueManager } from '../../models/queue-manager.js';
import { createTrack } from '../../models/test-fixtures.js';
import type { GuildPlayer } from '../../player/guild-player.js';
import type { PlaybackController } from '../../player/playback-controller.js';
import type { VoiceJoinTarget } from '../../player/voice-access.js';
import {
    clearCommandData,
    createClearCommand,
    createMoveCommand,
    createRemoveCommand,
    createShuffleCommand,
    moveCommandData,
    removeCommandData,
    shuffleCommandData,
} from './queue-editing-commands.js';

const voiceTarget: VoiceJoinTarget = {
    guildId: 'guild-id',
    voiceChannelId: 'voice-id',
    adapterCreator: (() => undefined) as unknown as DiscordGatewayAdapterCreator,
};

function createInteraction(options: { position?: number; from?: number; to?: number } = {}) {
    const reply = vi.fn().mockResolvedValue(undefined);
    return {
        interaction: {
            reply,
            options: {
                getInteger: (name: string) => options[name as keyof typeof options],
            },
        } as unknown as ChatInputCommandInteraction,
        reply,
    };
}

function createDependencies(queue: QueueManager) {
    const playback = { queue, currentTrack: createTrack('current') } as PlaybackController;
    return {
        players: {
            get: () =>
                ({
                    voiceChannelId: voiceTarget.voiceChannelId,
                    playback,
                }) as unknown as GuildPlayer,
        },
        resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
    };
}

describe('queue editing commands', () => {
    it('registers clear, remove, and move definitions', () => {
        expect(clearCommandData.toJSON()).toMatchObject({ name: 'clear' });
        expect(removeCommandData.toJSON()).toMatchObject({ name: 'remove' });
        expect(moveCommandData.toJSON()).toMatchObject({ name: 'move' });
        expect(shuffleCommandData.toJSON()).toMatchObject({ name: 'shuffle' });
    });

    it('clears waiting tracks without touching the current track', async () => {
        const fixture = createInteraction();
        const queue = new QueueManager();
        queue.add(createTrack('a'));
        queue.add(createTrack('b'));
        const dependencies = createDependencies(queue);
        const current = dependencies.players.get().playback?.currentTrack;

        await createClearCommand(dependencies).execute(fixture.interaction);

        expect(queue.isEmpty).toBe(true);
        expect(dependencies.players.get().playback?.currentTrack).toBe(current);
        expect(fixture.reply).toHaveBeenCalledWith('Removed 2 tracks from the queue');
    });

    it('removes a selected one-based queue position', async () => {
        const fixture = createInteraction({ position: 2 });
        const queue = new QueueManager();
        const first = createTrack('first');
        const second = createTrack('second');
        queue.add(first);
        queue.add(second);

        await createRemoveCommand(createDependencies(queue)).execute(fixture.interaction);

        expect(queue.snapshot()).toEqual([first]);
        expect(fixture.reply).toHaveBeenCalledWith(
            `Removed **${second.title}** from queue position 2`,
        );
    });

    it('moves a selected track and reports equal positions', async () => {
        const queue = new QueueManager();
        const tracks = [createTrack('a'), createTrack('b'), createTrack('c')];
        tracks.forEach((track) => queue.add(track));
        const moveFixture = createInteraction({ from: 1, to: 3 });
        const equalFixture = createInteraction({ from: 2, to: 2 });
        const dependencies = createDependencies(queue);

        await createMoveCommand(dependencies).execute(moveFixture.interaction);
        await createMoveCommand(dependencies).execute(equalFixture.interaction);

        expect(queue.snapshot()).toEqual([tracks[1], tracks[2], tracks[0]]);
        expect(moveFixture.reply).toHaveBeenCalledWith(
            `Moved **${tracks[0]?.title}** from position 1 to 3`,
        );
        expect(equalFixture.reply).toHaveBeenCalledWith(`**${tracks[2]?.title}** is already at 2`);
    });

    it('reports empty and out-of-range edits', async () => {
        const emptyFixture = createInteraction({ position: 1 });
        await createRemoveCommand(createDependencies(new QueueManager())).execute(
            emptyFixture.interaction,
        );
        expect(emptyFixture.reply).toHaveBeenCalledWith('The queue is empty');

        const queue = new QueueManager();
        queue.add(createTrack('only'));
        const invalidFixture = createInteraction({ from: 1, to: 2 });
        await createMoveCommand(createDependencies(queue)).execute(invalidFixture.interaction);
        expect(invalidFixture.reply).toHaveBeenCalledWith(
            'One or both queue positions do not exist',
        );
    });

    it('shuffles waiting tracks without changing the current track', async () => {
        const fixture = createInteraction();
        const randomValues = [0, 0.5];
        const queue = new QueueManager(() => randomValues.shift() ?? 0);
        const tracks = [createTrack('a'), createTrack('b'), createTrack('c')];
        tracks.forEach((track) => queue.add(track));
        const dependencies = createDependencies(queue);
        const current = dependencies.players.get().playback?.currentTrack;

        await createShuffleCommand(dependencies).execute(fixture.interaction);

        expect(queue.snapshot()).toEqual([tracks[2], tracks[1], tracks[0]]);
        expect(dependencies.players.get().playback?.currentTrack).toBe(current);
        expect(fixture.reply).toHaveBeenCalledWith('Shuffled 3 queued tracks');
    });

    it.each([0, 1])('reports a queue with %s waiting tracks as too short', async (size) => {
        const fixture = createInteraction();
        const queue = new QueueManager();
        if (size === 1) queue.add(createTrack('only'));

        await createShuffleCommand(createDependencies(queue)).execute(fixture.interaction);

        expect(fixture.reply).toHaveBeenCalledWith(
            'At least two queued tracks are required to shuffle',
        );
    });
});
