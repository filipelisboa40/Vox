import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { recordCommandResponse } from '../../models/test-fixtures.js';
import type { GuildPlayer } from '../../player/guild-player.js';
import type { PlaybackController } from '../../player/playback-controller.js';
import type { VoiceJoinTarget } from '../../player/voice-access.js';
import {
    createAbsoluteSeekCommand,
    createForwardSeekCommand,
    createReplayCommand,
    forwardSeekCommandData,
    replayCommandData,
    seekCommandData,
} from './seek-commands.js';

const voiceTarget: VoiceJoinTarget = {
    guildId: 'guild-id',
    voiceChannelId: 'voice-id',
    adapterCreator: (() => undefined) as unknown as DiscordGatewayAdapterCreator,
};

function createInteraction(options: { position?: string; amount?: number } = {}) {
    const reply = vi.fn();
    const interactionReply = vi.fn(recordCommandResponse(reply));
    return {
        interaction: {
            reply: interactionReply,
            options: {
                getString: () => options.position,
                getInteger: () => options.amount,
            },
        } as unknown as ChatInputCommandInteraction,
        reply,
    };
}

function createDependencies(playback: Partial<PlaybackController>) {
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

describe('replay and seek commands', () => {
    it('registers all seek command definitions', () => {
        expect(replayCommandData.toJSON()).toMatchObject({ name: 'replay' });
        expect(seekCommandData.toJSON()).toMatchObject({ name: 'seek' });
        expect(forwardSeekCommandData.toJSON()).toMatchObject({ name: 'fseek' });
    });

    it('replays the current track', async () => {
        const fixture = createInteraction();
        const replay = vi.fn().mockResolvedValue({ status: 'seeked', positionMs: 0 });

        await createReplayCommand(createDependencies({ replay })).execute(fixture.interaction);

        expect(replay).toHaveBeenCalledOnce();
        expect(fixture.reply).toHaveBeenCalledWith('Replaying the current track');
    });

    it('parses and applies an absolute position', async () => {
        const fixture = createInteraction({ position: '1:30' });
        const seek = vi.fn().mockResolvedValue({ status: 'seeked', positionMs: 90_000 });

        await createAbsoluteSeekCommand(createDependencies({ seek })).execute(fixture.interaction);

        expect(seek).toHaveBeenCalledWith(90_000);
        expect(fixture.reply).toHaveBeenCalledWith('Moved playback to 1:30');
    });

    it('applies a signed relative amount', async () => {
        const fixture = createInteraction({ amount: -15 });
        const seekRelative = vi.fn().mockResolvedValue({ status: 'seeked', positionMs: 30_000 });

        await createForwardSeekCommand(createDependencies({ seekRelative })).execute(
            fixture.interaction,
        );

        expect(seekRelative).toHaveBeenCalledWith(-15_000);
        expect(fixture.reply).toHaveBeenCalledWith('Moved playback to 0:30');
    });

    it('reports invalid and unsupported positions safely', async () => {
        const invalidFixture = createInteraction({ position: '1:99' });
        const unsupportedFixture = createInteraction({ position: '10' });
        const seek = vi.fn().mockResolvedValue({ status: 'unsupported' });

        await createAbsoluteSeekCommand(createDependencies({ seek })).execute(
            invalidFixture.interaction,
        );
        await createAbsoluteSeekCommand(createDependencies({ seek })).execute(
            unsupportedFixture.interaction,
        );

        expect(invalidFixture.reply).toHaveBeenCalledWith(
            'Use seconds, MM:SS, or HH:MM:SS for the playback position',
        );
        expect(unsupportedFixture.reply).toHaveBeenCalledWith(
            'The current provider does not support seeking this track',
        );
    });
});
