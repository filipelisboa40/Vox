import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { GuildPlayer } from '../../player/guild-player.js';
import type { VoiceJoinTarget } from '../../player/voice-access.js';
import { createVolumeCommand, volumeCommandData } from './volume-command.js';

const voiceTarget: VoiceJoinTarget = {
    guildId: 'guild-id',
    voiceChannelId: 'voice-id',
    adapterCreator: (() => undefined) as unknown as DiscordGatewayAdapterCreator,
};

function createInteraction(level: number) {
    const reply = vi.fn().mockResolvedValue(undefined);
    return {
        interaction: {
            options: { getInteger: () => level },
            reply,
        } as unknown as ChatInputCommandInteraction,
        reply,
    };
}

function createPlayer(voiceChannelId = voiceTarget.voiceChannelId) {
    const setVolume = vi.fn();
    return {
        player: { voiceChannelId, playback: {}, setVolume } as unknown as GuildPlayer,
        setVolume,
    };
}

describe('volume command', () => {
    it('registers Discord-side integer boundaries', () => {
        const definition = volumeCommandData.toJSON();
        expect(definition).toMatchObject({ name: 'volume' });
        expect(definition.options?.[0]).toMatchObject({ min_value: 0, max_value: 100 });
    });

    it.each([0, 50, 100])('sets volume level %s', async (level) => {
        const fixture = createInteraction(level);
        const player = createPlayer();
        const command = createVolumeCommand({
            players: { get: () => player.player },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(player.setVolume).toHaveBeenCalledWith(level / 100);
        expect(fixture.reply).toHaveBeenCalledWith(
            level === 0
                ? 'Volume set to 0% (playback is muted, not paused)'
                : `Volume set to ${level}%`,
        );
    });

    it.each([-1, 101, 10.5])('defensively rejects invalid level %s', async (level) => {
        const fixture = createInteraction(level);
        const player = createPlayer();
        const command = createVolumeCommand({
            players: { get: () => player.player },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(player.setVolume).not.toHaveBeenCalled();
        expect(fixture.reply).toHaveBeenCalledWith('Volume must be an integer from 0 through 100');
    });

    it('requires the requester to share the bot voice channel', async () => {
        const fixture = createInteraction(50);
        const player = createPlayer('other-channel');
        const command = createVolumeCommand({
            players: { get: () => player.player },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(player.setVolume).not.toHaveBeenCalled();
        expect(fixture.reply).toHaveBeenCalledWith(
            "Join the bot's voice channel to control playback",
        );
    });
});
