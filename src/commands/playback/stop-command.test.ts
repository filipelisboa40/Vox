import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { recordCommandResponse } from '../../models/test-fixtures.js';
import type { GuildPlayer } from '../../player/guild-player.js';
import type { PlaybackController } from '../../player/playback-controller.js';
import type { VoiceJoinTarget } from '../../player/voice-access.js';
import { createStopCommand, stopCommandData } from './stop-command.js';

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

function createGuildPlayer(
    stop: ReturnType<typeof vi.fn>,
    voiceChannelId = 'voice-id',
): GuildPlayer {
    return {
        voiceChannelId,
        playback: { stop } as unknown as PlaybackController,
    } as unknown as GuildPlayer;
}

describe('stop command', () => {
    it('registers the stop command definition', () => {
        expect(stopCommandData.toJSON()).toMatchObject({ name: 'stop' });
    });

    it.each(['active', 'paused'])('stops %s playback without disconnecting', async () => {
        const fixture = createInteraction();
        const stop = vi.fn().mockResolvedValue(true);
        const guildPlayer = createGuildPlayer(stop);
        const command = createStopCommand({
            players: { get: () => guildPlayer },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(stop).toHaveBeenCalledOnce();
        expect(fixture.reply).toHaveBeenCalledWith('Playback stopped and the queue was cleared');
    });

    it('reports an already stopped player', async () => {
        const fixture = createInteraction();
        const command = createStopCommand({
            players: { get: () => createGuildPlayer(vi.fn().mockResolvedValue(false)) },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(fixture.reply).toHaveBeenCalledWith('Nothing is currently playing in this server');
    });

    it('requires the caller to share the bot voice channel', async () => {
        const fixture = createInteraction();
        const stop = vi.fn();
        const command = createStopCommand({
            players: { get: () => createGuildPlayer(stop, 'different-channel') },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(stop).not.toHaveBeenCalled();
        expect(fixture.reply).toHaveBeenCalledWith(
            "Join the bot's voice channel to control playback",
        );
    });
});
