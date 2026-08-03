import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { GuildPlayer } from '../../player/guild-player.js';
import type { PlaybackController } from '../../player/playback-controller.js';
import type { VoiceJoinTarget } from '../../player/voice-access.js';
import {
    createPauseCommand,
    createResumeCommand,
    pauseCommandData,
    resumeCommandData,
} from './pause-resume-commands.js';

const voiceTarget: VoiceJoinTarget = {
    guildId: 'guild-id',
    voiceChannelId: 'voice-id',
    adapterCreator: (() => undefined) as unknown as DiscordGatewayAdapterCreator,
};

function createInteraction(): {
    readonly interaction: ChatInputCommandInteraction;
    readonly reply: ReturnType<typeof vi.fn>;
} {
    const reply = vi.fn().mockResolvedValue(undefined);
    return {
        interaction: { reply } as unknown as ChatInputCommandInteraction,
        reply,
    };
}

function createGuildPlayer(options: {
    readonly voiceChannelId?: string;
    readonly pause?: () => boolean;
    readonly resume?: () => boolean;
}): GuildPlayer {
    const playback = {
        pause: options.pause ?? (() => false),
        resume: options.resume ?? (() => false),
    } as PlaybackController;

    return {
        voiceChannelId: options.voiceChannelId ?? voiceTarget.voiceChannelId,
        playback,
    } as GuildPlayer;
}

describe('pause and resume commands', () => {
    it('registers both command definitions', () => {
        expect(pauseCommandData.toJSON()).toMatchObject({ name: 'pause' });
        expect(resumeCommandData.toJSON()).toMatchObject({ name: 'resume' });
    });

    it('pauses active playback', async () => {
        const fixture = createInteraction();
        const pause = vi.fn().mockReturnValue(true);
        const command = createPauseCommand({
            players: { get: () => createGuildPlayer({ pause }) },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(pause).toHaveBeenCalledOnce();
        expect(fixture.reply).toHaveBeenCalledWith('Playback paused');
    });

    it('resumes paused playback', async () => {
        const fixture = createInteraction();
        const resume = vi.fn().mockReturnValue(true);
        const command = createResumeCommand({
            players: { get: () => createGuildPlayer({ resume }) },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(resume).toHaveBeenCalledOnce();
        expect(fixture.reply).toHaveBeenCalledWith('Playback resumed');
    });

    it('reports repeated or invalid state transitions', async () => {
        const pauseFixture = createInteraction();
        const resumeFixture = createInteraction();
        const player = createGuildPlayer({});
        const dependencies = {
            players: { get: () => player },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        };

        await createPauseCommand(dependencies).execute(pauseFixture.interaction);
        await createResumeCommand(dependencies).execute(resumeFixture.interaction);

        expect(pauseFixture.reply).toHaveBeenCalledWith('Playback is not currently playing');
        expect(resumeFixture.reply).toHaveBeenCalledWith('Playback is not paused');
    });

    it('reports missing playback', async () => {
        const fixture = createInteraction();
        const command = createPauseCommand({
            players: { get: () => undefined },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(fixture.reply).toHaveBeenCalledWith('Nothing is currently playing in this server');
    });

    it('requires the caller to share the bot voice channel', async () => {
        const fixture = createInteraction();
        const command = createPauseCommand({
            players: { get: () => createGuildPlayer({ voiceChannelId: 'another-channel' }) },
            resolveVoiceTarget: vi.fn().mockResolvedValue(voiceTarget),
        });

        await command.execute(fixture.interaction);

        expect(fixture.reply).toHaveBeenCalledWith(
            "Join the bot's voice channel to control playback",
        );
    });
});
