import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { recordCommandResponse } from '../../models/test-fixtures.js';
import type { GuildPlayer } from '../../player/guild-player.js';
import type { VoiceJoinTarget } from '../../player/voice-access.js';
import { createDisconnectCommand, disconnectCommandData } from './disconnect-command.js';

const voiceTarget: VoiceJoinTarget = {
    guildId: 'guild-id',
    voiceChannelId: 'voice-id',
    adapterCreator: (() => undefined) as unknown as DiscordGatewayAdapterCreator,
};

function createInteraction(username = 'Vox'): {
    readonly interaction: ChatInputCommandInteraction;
    readonly reply: ReturnType<typeof vi.fn>;
} {
    const reply = vi.fn();
    const interactionReply = vi.fn(recordCommandResponse(reply));
    return {
        interaction: {
            reply: interactionReply,
            client: { user: { username } },
        } as unknown as ChatInputCommandInteraction,
        reply,
    };
}

describe('disconnect command', () => {
    it('registers the command definition', () => {
        expect(disconnectCommandData.toJSON()).toMatchObject({ name: 'disconnect' });
    });

    it('destroys the session and uses the current bot name', async () => {
        const fixture = createInteraction('BlackBot');
        const destroy = vi.fn().mockResolvedValue(true);
        const command = createDisconnectCommand({
            players: {
                get: () => ({ voiceChannelId: voiceTarget.voiceChannelId }) as GuildPlayer,
                destroy,
            },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(destroy).toHaveBeenCalledWith(voiceTarget.guildId);
        expect(fixture.reply).toHaveBeenCalledWith('BlackBot disconnected from the voice channel');
    });

    it('reports a missing session without attempting cleanup', async () => {
        const fixture = createInteraction();
        const destroy = vi.fn();
        const command = createDisconnectCommand({
            players: { get: () => undefined, destroy },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(destroy).not.toHaveBeenCalled();
        expect(fixture.reply).toHaveBeenCalledWith('The bot is not connected in this server');
    });

    it('requires the caller to share the bot voice channel', async () => {
        const fixture = createInteraction();
        const destroy = vi.fn();
        const command = createDisconnectCommand({
            players: {
                get: () => ({ voiceChannelId: 'another-channel' }) as GuildPlayer,
                destroy,
            },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(destroy).not.toHaveBeenCalled();
        expect(fixture.reply).toHaveBeenCalledWith(
            "Join the bot's voice channel to control playback",
        );
    });
});
