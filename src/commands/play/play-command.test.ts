import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { recordCommandResponse } from '../../models/test-fixtures.js';
import type { GuildPlayer } from '../../player/guild-player.js';
import { VoiceAccessError, type VoiceJoinTarget } from '../../player/voice-access.js';
import type { ProviderTrack } from '../../providers/audio-provider.js';
import { NoMediaResultsError } from '../../providers/provider-errors.js';
import { MediaLookupRateLimitError } from '../../utilities/media-lookup-limiter.js';
import { createPlayCommand, playCommandData } from './play-command.js';

const voiceTarget: VoiceJoinTarget = {
    guildId: 'guild-id',
    voiceChannelId: 'voice-id',
    adapterCreator: (() => undefined) as unknown as DiscordGatewayAdapterCreator,
};

const providerTrack: ProviderTrack = {
    provider: 'test',
    providerTrackId: 'track-id',
    title: 'Example *song*',
    url: 'https://example.com/song',
    durationMs: 185_000,
};

function createInteraction(query = 'example song'): {
    readonly interaction: ChatInputCommandInteraction;
    readonly editReply: ReturnType<typeof vi.fn>;
} {
    const editReply = vi.fn();
    const interactionEditReply = vi.fn(recordCommandResponse(editReply));
    const interaction = {
        options: { getString: vi.fn().mockReturnValue(query) },
        user: { id: 'user-id', username: 'Requester', globalName: null },
        editReply: interactionEditReply,
    } as unknown as ChatInputCommandInteraction;
    return { interaction, editReply };
}

function createGuildPlayer(enqueue: ReturnType<typeof vi.fn>): GuildPlayer {
    return {
        playback: { enqueue },
        waitUntilReady: vi.fn().mockResolvedValue(undefined),
    } as unknown as GuildPlayer;
}

describe('play command', () => {
    it('registers the required query option', () => {
        const commandJson = playCommandData.toJSON();

        expect(commandJson.name).toBe('play');
        expect(commandJson.options).toEqual([
            expect.objectContaining({ name: 'query', required: true, type: 3 }),
        ]);
    });

    it('rate-limits media lookup before contacting a provider', async () => {
        const fixture = createInteraction();
        const resolve = vi.fn();
        const command = createPlayCommand({
            providers: { resolve },
            players: { getOrCreate: vi.fn() },
            lookupLimiter: {
                acquire: () => {
                    throw new MediaLookupRateLimitError();
                },
            },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(resolve).not.toHaveBeenCalled();
        expect(fixture.editReply).toHaveBeenCalledWith(
            'Too many music requests. Please wait a moment and try again',
        );
    });

    it('resolves and starts a track while idle', async () => {
        const fixture = createInteraction();
        const enqueue = vi.fn().mockResolvedValue({ status: 'started' });
        const resolve = vi.fn().mockResolvedValue(providerTrack);
        const getOrCreate = vi.fn().mockReturnValue(createGuildPlayer(enqueue));
        const command = createPlayCommand({
            providers: { resolve },
            players: { getOrCreate },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(resolve).toHaveBeenCalledWith('example song');
        expect(getOrCreate).toHaveBeenCalledWith(voiceTarget);
        expect(enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                providerTrackId: 'track-id',
                requestedBy: { userId: 'user-id', displayName: 'Requester' },
            }),
        );
        expect(fixture.editReply).toHaveBeenCalledWith(
            expect.stringContaining('Now playing **Example \\*song\\***'),
        );
        expect(fixture.editReply).toHaveBeenCalledWith(expect.stringContaining('3:05'));
    });

    it('reports the waiting position when playback is active', async () => {
        const fixture = createInteraction('https://example.com/song');
        const command = createPlayCommand({
            providers: { resolve: vi.fn().mockResolvedValue(providerTrack) },
            players: {
                getOrCreate: vi
                    .fn()
                    .mockReturnValue(
                        createGuildPlayer(
                            vi.fn().mockResolvedValue({ status: 'queued', position: 2 }),
                        ),
                    ),
            },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(fixture.editReply).toHaveBeenCalledWith(expect.stringContaining('queue position 2'));
    });

    it('returns a useful no-results response', async () => {
        const fixture = createInteraction('missing');
        const command = createPlayCommand({
            providers: { resolve: () => Promise.reject(new NoMediaResultsError('missing')) },
            players: { getOrCreate: vi.fn() },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(fixture.editReply).toHaveBeenCalledWith('No media results were found');
    });

    it('validates voice access before resolving media', async () => {
        const fixture = createInteraction();
        const resolve = vi.fn();
        const command = createPlayCommand({
            providers: { resolve },
            players: { getOrCreate: vi.fn() },
            resolveVoiceTarget: () =>
                Promise.reject(
                    new VoiceAccessError('Join a voice channel before using this command'),
                ),
        });

        await command.execute(fixture.interaction);

        expect(resolve).not.toHaveBeenCalled();
        expect(fixture.editReply).toHaveBeenCalledWith(
            'Join a voice channel before using this command',
        );
    });

    it('lets unexpected provider failures reach centralized error handling', async () => {
        const fixture = createInteraction();
        const command = createPlayCommand({
            providers: { resolve: () => Promise.reject(new Error('unexpected')) },
            players: { getOrCreate: vi.fn() },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await expect(command.execute(fixture.interaction)).rejects.toThrow('unexpected');
    });
});
