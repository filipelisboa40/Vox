import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { LoopMode } from '../../models/playback-state.js';
import { recordCommandResponse } from '../../models/test-fixtures.js';
import type { GuildPlayer } from '../../player/guild-player.js';
import type { PlaybackController } from '../../player/playback-controller.js';
import type { VoiceJoinTarget } from '../../player/voice-access.js';
import {
    createLoopCommand,
    createLoopQueueCommand,
    loopCommandData,
    loopQueueCommandData,
} from './loop-commands.js';

const voiceTarget: VoiceJoinTarget = {
    guildId: 'guild-id',
    voiceChannelId: 'voice-id',
    adapterCreator: (() => undefined) as unknown as DiscordGatewayAdapterCreator,
};

function createInteraction() {
    const reply = vi.fn();
    const interactionReply = vi.fn(recordCommandResponse(reply));
    return {
        interaction: { reply: interactionReply } as unknown as ChatInputCommandInteraction,
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

describe('loop commands', () => {
    it('registers track and queue loop definitions', () => {
        expect(loopCommandData.toJSON()).toMatchObject({ name: 'loop' });
        expect(loopQueueCommandData.toJSON()).toMatchObject({ name: 'loop-queue' });
    });

    it('reports track loop enabled and disabled states', async () => {
        const enabledFixture = createInteraction();
        const disabledFixture = createInteraction();
        const toggleTrackLoop = vi
            .fn()
            .mockReturnValueOnce(LoopMode.Track)
            .mockReturnValueOnce(LoopMode.Off);
        const command = createLoopCommand(createDependencies({ toggleTrackLoop }));

        await command.execute(enabledFixture.interaction);
        await command.execute(disabledFixture.interaction);

        expect(enabledFixture.reply).toHaveBeenCalledWith('Track loop enabled');
        expect(disabledFixture.reply).toHaveBeenCalledWith('Track loop disabled');
    });

    it('reports queue loop enabled and disables the other mode through the controller', async () => {
        const fixture = createInteraction();
        const toggleQueueLoop = vi.fn().mockReturnValue(LoopMode.Queue);

        await createLoopQueueCommand(createDependencies({ toggleQueueLoop })).execute(
            fixture.interaction,
        );

        expect(toggleQueueLoop).toHaveBeenCalledOnce();
        expect(fixture.reply).toHaveBeenCalledWith('Queue loop enabled');
    });

    it('requires active playback', async () => {
        const fixture = createInteraction();
        const command = createLoopCommand({
            players: { get: () => undefined },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(fixture.reply).toHaveBeenCalledWith('Nothing is currently playing in this server');
    });
});
