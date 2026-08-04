import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { LoopMode } from '../../models/playback-state.js';
import { QueueManager } from '../../models/queue-manager.js';
import { createTrack } from '../../models/test-fixtures.js';
import type { Track } from '../../models/track.js';
import type { GuildPlayer } from '../../player/guild-player.js';
import type { PlaybackController } from '../../player/playback-controller.js';
import {
    createNextCommand,
    createNowPlayingCommand,
    createQueueCommand,
    nextCommandData,
    nowPlayingCommandData,
    queueCommandData,
} from './queue-information-commands.js';

function createInteraction(page: number | null = null) {
    const reply = vi.fn().mockResolvedValue(undefined);
    return {
        interaction: {
            guildId: 'guild-id',
            options: { getInteger: () => page },
            reply,
        } as unknown as ChatInputCommandInteraction,
        reply,
    };
}

function createDependencies(options: {
    currentTrack?: Track;
    tracks?: readonly Track[];
    positionMs?: number;
    volume?: number;
}) {
    const queue = new QueueManager();
    options.tracks?.forEach((track) => queue.add(track));
    const playback = {
        currentTrack: options.currentTrack,
        playbackPositionMs: options.positionMs ?? 0,
        volume: options.volume ?? 1,
        loopMode: LoopMode.Off,
        queue,
    } as PlaybackController;
    return {
        players: {
            get: () => ({ playback }) as GuildPlayer,
        },
    };
}

function getEmbed(reply: ReturnType<typeof vi.fn>): ReturnType<EmbedBuilder['toJSON']> {
    const payload = reply.mock.calls[0]?.[0] as { embeds: EmbedBuilder[] };
    const embed = payload.embeds[0];
    if (embed === undefined) throw new Error('Expected an embed reply');
    return embed.toJSON();
}

describe('queue information commands', () => {
    it('registers all information command definitions', () => {
        expect(nowPlayingCommandData.toJSON()).toMatchObject({ name: 'now-playing' });
        expect(nextCommandData.toJSON()).toMatchObject({ name: 'next' });
        expect(queueCommandData.toJSON()).toMatchObject({ name: 'queue' });
    });

    it('reports empty playback and queues', async () => {
        const nowFixture = createInteraction();
        const nextFixture = createInteraction();
        const queueFixture = createInteraction();
        const dependencies = createDependencies({});

        await createNowPlayingCommand(dependencies).execute(nowFixture.interaction);
        await createNextCommand(dependencies).execute(nextFixture.interaction);
        await createQueueCommand(dependencies).execute(queueFixture.interaction);

        expect(nowFixture.reply).toHaveBeenCalledWith(
            'Nothing is currently playing in this server',
        );
        expect(nextFixture.reply).toHaveBeenCalledWith('The queue is empty');
        expect(queueFixture.reply).toHaveBeenCalledWith('The queue is empty');
    });

    it('shows progress, requester, volume, and loop mode for the current track', async () => {
        const fixture = createInteraction();
        const track = createTrack('current');

        await createNowPlayingCommand(
            createDependencies({ currentTrack: track, positionMs: 90_000, volume: 0.75 }),
        ).execute(fixture.interaction);

        const embed = getEmbed(fixture.reply);
        expect(embed.description).toContain(track.title);
        expect(embed.fields?.map((field) => field.value).join(' ')).toContain('1:30 / 3:00');
        expect(embed.fields?.map((field) => field.value)).toContain('75%');
        expect(embed.fields?.map((field) => field.value)).toContain(
            `<@${track.requestedBy.userId}>`,
        );
    });

    it('handles unknown durations without inventing wait estimates', async () => {
        const fixture = createInteraction();
        const unknown = { ...createTrack('unknown'), durationMs: null };

        await createNextCommand(
            createDependencies({ currentTrack: unknown, tracks: [unknown] }),
        ).execute(fixture.interaction);

        expect(fixture.reply).toHaveBeenCalledWith(expect.stringContaining('starts in unknown'));
    });

    it('paginates queue entries and stays below Discord embed limits', async () => {
        const fixture = createInteraction(3);
        const tracks = Array.from({ length: 23 }, (_, index) => ({
            ...createTrack(String(index + 1)),
            title: `Track ${index + 1} ${'x'.repeat(180)}`,
        }));

        await createQueueCommand(
            createDependencies({ currentTrack: createTrack('current'), tracks }),
        ).execute(fixture.interaction);

        const embed = getEmbed(fixture.reply);
        expect(embed.description).toContain('21.');
        expect(embed.description).toContain('23.');
        expect(embed.description).not.toContain('20.');
        expect(embed.description?.length).toBeLessThanOrEqual(4_096);
        expect(embed.footer?.text).toContain('Page 3/3');
    });

    it('rejects pages beyond the queue boundary', async () => {
        const fixture = createInteraction(2);

        await createQueueCommand(createDependencies({ tracks: [createTrack('only')] })).execute(
            fixture.interaction,
        );

        expect(fixture.reply).toHaveBeenCalledWith('Queue page 2 does not exist');
    });
});
