import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import type { GuildPlayer } from './guild-player.js';
import {
    PlayerManager,
    PlayerVoiceChannelMismatchError,
    type GuildPlayerFactory,
    type JoinGuildPlayerOptions,
} from './player-manager.js';

const adapterCreator = (() => undefined) as unknown as DiscordGatewayAdapterCreator;

function joinOptions(guildId: string, voiceChannelId = `voice-${guildId}`): JoinGuildPlayerOptions {
    return { guildId, voiceChannelId, adapterCreator };
}

interface FactoryFixture {
    readonly factory: GuildPlayerFactory;
    readonly createdPlayers: GuildPlayer[];
    readonly destroyCallbacks: Map<string, () => void>;
    readonly destroyMocks: Map<string, ReturnType<typeof vi.fn>>;
}

function createFactoryFixture(): FactoryFixture {
    const createdPlayers: GuildPlayer[] = [];
    const destroyCallbacks = new Map<string, () => void>();
    const destroyMocks = new Map<string, ReturnType<typeof vi.fn>>();

    const factory: GuildPlayerFactory = (options, onDestroyed) => {
        const destroy = vi.fn();
        const player = {
            guildId: options.guildId,
            voiceChannelId: options.voiceChannelId,
            destroy,
        } as unknown as GuildPlayer;

        createdPlayers.push(player);
        destroyCallbacks.set(options.guildId, onDestroyed);
        destroyMocks.set(options.guildId, destroy);
        return player;
    };

    return { factory, createdPlayers, destroyCallbacks, destroyMocks };
}

function createManager(fixture: FactoryFixture): PlayerManager {
    return new PlayerManager({} as Logger, fixture.factory);
}

describe('PlayerManager', () => {
    it('creates isolated guild players', () => {
        const fixture = createFactoryFixture();
        const manager = createManager(fixture);

        const first = manager.getOrCreate(joinOptions('guild-one'));
        const second = manager.getOrCreate(joinOptions('guild-two'));

        expect(first).not.toBe(second);
        expect(manager.get('guild-one')).toBe(first);
        expect(manager.get('guild-two')).toBe(second);
        expect(manager.size).toBe(2);
    });

    it('reuses the existing player for duplicate joins to the same channel', () => {
        const fixture = createFactoryFixture();
        const manager = createManager(fixture);

        const first = manager.getOrCreate(joinOptions('guild'));
        const duplicate = manager.getOrCreate(joinOptions('guild'));

        expect(duplicate).toBe(first);
        expect(fixture.createdPlayers).toHaveLength(1);
    });

    it('rejects a second channel while the guild player is active', () => {
        const fixture = createFactoryFixture();
        const manager = createManager(fixture);
        manager.getOrCreate(joinOptions('guild', 'first-channel'));

        expect(() => manager.getOrCreate(joinOptions('guild', 'second-channel'))).toThrow(
            PlayerVoiceChannelMismatchError,
        );
    });

    it('removes a guild player after its connection is destroyed', () => {
        const fixture = createFactoryFixture();
        const manager = createManager(fixture);
        manager.getOrCreate(joinOptions('guild'));

        fixture.destroyCallbacks.get('guild')?.();

        expect(manager.get('guild')).toBeUndefined();
        expect(manager.size).toBe(0);
    });

    it('destroys one selected guild player', () => {
        const fixture = createFactoryFixture();
        const manager = createManager(fixture);
        manager.getOrCreate(joinOptions('guild'));

        expect(manager.destroy('guild')).toBe(true);
        expect(fixture.destroyMocks.get('guild')).toHaveBeenCalledOnce();
        expect(manager.destroy('guild')).toBe(false);
    });

    it('destroys and removes every guild player', () => {
        const fixture = createFactoryFixture();
        const manager = createManager(fixture);
        manager.getOrCreate(joinOptions('guild-one'));
        manager.getOrCreate(joinOptions('guild-two'));

        manager.destroyAll();

        expect(manager.size).toBe(0);
        expect(fixture.destroyMocks.get('guild-one')).toHaveBeenCalledOnce();
        expect(fixture.destroyMocks.get('guild-two')).toHaveBeenCalledOnce();
    });
});
