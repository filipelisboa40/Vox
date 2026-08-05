import { AudioPlayerStatus, VoiceConnectionStatus } from '@discordjs/voice';
import type { AudioPlayer, VoiceConnection } from '@discordjs/voice';
import { EventEmitter } from 'node:events';
import type { Logger } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlaybackController } from './playback-controller.js';
import { GuildPlayer } from './guild-player.js';

interface GuildPlayerFixture {
    readonly player: GuildPlayer;
    readonly connection: EventEmitter & {
        state: { status: VoiceConnectionStatus };
        destroy: ReturnType<typeof vi.fn>;
    };
    readonly audioPlayer: EventEmitter & {
        state: { status: AudioPlayerStatus };
        stop: ReturnType<typeof vi.fn>;
    };
    readonly dispose: ReturnType<typeof vi.fn>;
    readonly onDestroyed: ReturnType<typeof vi.fn>;
}

function createFixture(idleDisconnectMs = 1_000): GuildPlayerFixture {
    const connection = Object.assign(new EventEmitter(), {
        state: { status: VoiceConnectionStatus.Ready },
        subscribe: vi.fn(),
        destroy: vi.fn(),
    });
    connection.destroy.mockImplementation(() => {
        connection.state.status = VoiceConnectionStatus.Destroyed;
        connection.emit(VoiceConnectionStatus.Destroyed);
    });

    const audioPlayer = Object.assign(new EventEmitter(), {
        state: { status: AudioPlayerStatus.Playing },
        stop: vi.fn(),
    });
    const dispose = vi.fn().mockResolvedValue(undefined);
    const playback = {
        currentTrack: undefined,
        queue: { isEmpty: true },
        dispose,
    } as unknown as PlaybackController;
    const onDestroyed = vi.fn();
    const logger = {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    } as unknown as Logger;
    const player = new GuildPlayer({
        guildId: 'guild-id',
        voiceChannelId: 'voice-id',
        connection: connection as unknown as VoiceConnection,
        audioPlayer: audioPlayer as unknown as AudioPlayer,
        playback,
        logger,
        onDestroyed,
        idleDisconnectMs,
    });

    return { player, connection, audioPlayer, dispose, onDestroyed };
}

afterEach(() => vi.useRealTimers());

describe('GuildPlayer cleanup', () => {
    it('disconnects after the configured idle timeout', async () => {
        vi.useFakeTimers();
        const fixture = createFixture();
        fixture.audioPlayer.state.status = AudioPlayerStatus.Idle;

        fixture.audioPlayer.emit(AudioPlayerStatus.Idle);
        await vi.advanceTimersByTimeAsync(1_000);

        expect(fixture.dispose).toHaveBeenCalledOnce();
        expect(fixture.connection.destroy).toHaveBeenCalledOnce();
        expect(fixture.onDestroyed).toHaveBeenCalledOnce();
    });

    it('cancels idle cleanup when playback resumes', async () => {
        vi.useFakeTimers();
        const fixture = createFixture();
        fixture.audioPlayer.state.status = AudioPlayerStatus.Idle;
        fixture.audioPlayer.emit(AudioPlayerStatus.Idle);

        fixture.audioPlayer.state.status = AudioPlayerStatus.Playing;
        fixture.audioPlayer.emit(AudioPlayerStatus.Playing);
        await vi.advanceTimersByTimeAsync(1_000);

        expect(fixture.dispose).not.toHaveBeenCalled();
        expect(fixture.connection.destroy).not.toHaveBeenCalled();
    });

    it('cleans playback when Discord destroys the connection externally', async () => {
        const fixture = createFixture();
        fixture.connection.state.status = VoiceConnectionStatus.Destroyed;

        fixture.connection.emit(VoiceConnectionStatus.Destroyed);
        await Promise.resolve();

        expect(fixture.dispose).toHaveBeenCalledOnce();
        expect(fixture.onDestroyed).toHaveBeenCalledOnce();
    });

    it('makes repeated manual cleanup harmless', async () => {
        const fixture = createFixture();

        await fixture.player.destroy();
        await fixture.player.destroy();

        expect(fixture.dispose).toHaveBeenCalledOnce();
        expect(fixture.connection.destroy).toHaveBeenCalledOnce();
    });
});
