import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { createTrack, recordCommandResponse } from '../../models/test-fixtures.js';
import type { GuildPlayer } from '../../player/guild-player.js';
import type { PlaybackController } from '../../player/playback-controller.js';
import type { VoiceJoinTarget } from '../../player/voice-access.js';
import {
    createSkipCommand,
    createUnskipCommand,
    skipCommandData,
    unskipCommandData,
} from './skip-unskip-commands.js';

const voiceTarget: VoiceJoinTarget = {
    guildId: 'guild-id',
    voiceChannelId: 'voice-id',
    adapterCreator: (() => undefined) as unknown as DiscordGatewayAdapterCreator,
};

function createInteraction(): {
    readonly interaction: ChatInputCommandInteraction;
    readonly reply: ReturnType<typeof vi.fn>;
} {
    const reply = vi.fn();
    const interactionReply = vi.fn(recordCommandResponse(reply));
    return {
        interaction: { reply: interactionReply } as unknown as ChatInputCommandInteraction,
        reply,
    };
}

function createCommandDependencies(playback: Partial<PlaybackController>) {
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

describe('skip and unskip commands', () => {
    it('registers both command definitions', () => {
        expect(skipCommandData.toJSON()).toMatchObject({ name: 'skip' });
        expect(unskipCommandData.toJSON()).toMatchObject({ name: 'unskip' });
    });

    it('reports the skipped and next tracks', async () => {
        const fixture = createInteraction();
        const first = createTrack('first');
        const second = createTrack('second');
        const skip = vi.fn().mockResolvedValue({ status: 'skipped', skipped: first, next: second });

        await createSkipCommand(createCommandDependencies({ skip })).execute(fixture.interaction);

        expect(fixture.reply).toHaveBeenCalledWith(
            `Skipped **${first.title}**; now playing **${second.title}**`,
        );
    });

    it('reports an empty queue after skipping the final track', async () => {
        const fixture = createInteraction();
        const track = createTrack('only');
        const skip = vi.fn().mockResolvedValue({ status: 'skipped', skipped: track });

        await createSkipCommand(createCommandDependencies({ skip })).execute(fixture.interaction);

        expect(fixture.reply).toHaveBeenCalledWith(
            `Skipped **${track.title}**; the queue is now empty`,
        );
    });

    it('restores the latest skipped track', async () => {
        const fixture = createInteraction();
        const track = createTrack('restored');
        const unskip = vi.fn().mockResolvedValue({ status: 'restored', track, positionMs: 10_000 });

        await createUnskipCommand(createCommandDependencies({ unskip })).execute(
            fixture.interaction,
        );

        expect(fixture.reply).toHaveBeenCalledWith(`Restored **${track.title}**`);
    });

    it('reports unavailable skip and unskip operations', async () => {
        const skipFixture = createInteraction();
        const unskipFixture = createInteraction();

        await createSkipCommand(
            createCommandDependencies({
                skip: vi.fn().mockResolvedValue({ status: 'nothing-playing' }),
            }),
        ).execute(skipFixture.interaction);
        await createUnskipCommand(
            createCommandDependencies({
                unskip: vi.fn().mockResolvedValue({ status: 'nothing-to-unskip' }),
            }),
        ).execute(unskipFixture.interaction);

        expect(skipFixture.reply).toHaveBeenCalledWith(
            'Nothing is currently playing in this server',
        );
        expect(unskipFixture.reply).toHaveBeenCalledWith('There is no skipped track to restore');
    });
});
