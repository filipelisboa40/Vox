import { describe, expect, it } from 'vitest';

import { ConfigurationError, parseEnvironment } from './environment.js';

const validInput = {
    DISCORD_TOKEN: 'test-token-that-must-never-appear-in-errors',
    DISCORD_CLIENT_ID: '123456789012345678',
    YOUTUBE_API_KEY: 'youtube-test-key',
    LAVALINK_URL: 'http://localhost:2333',
    LAVALINK_PASSWORD: 'lavalink-test-password',
};

describe('parseEnvironment', () => {
    it('returns typed configuration for valid required values', () => {
        expect(parseEnvironment(validInput)).toEqual({
            discordToken: validInput.DISCORD_TOKEN,
            discordClientId: validInput.DISCORD_CLIENT_ID,
            youtubeApiKey: validInput.YOUTUBE_API_KEY,
            lavalinkUrl: validInput.LAVALINK_URL,
            lavalinkPassword: validInput.LAVALINK_PASSWORD,
            defaultVolume: 50,
            idleDisconnectMs: 300_000,
        });
    });

    it('configures or disables the idle disconnect timeout', () => {
        expect(
            parseEnvironment({ ...validInput, IDLE_DISCONNECT_SECONDS: '15' }).idleDisconnectMs,
        ).toBe(15_000);
        expect(
            parseEnvironment({ ...validInput, IDLE_DISCONNECT_SECONDS: '0' }).idleDisconnectMs,
        ).toBe(0);
        expect(() => parseEnvironment({ ...validInput, IDLE_DISCONNECT_SECONDS: '-1' })).toThrow(
            ConfigurationError,
        );
    });

    it('validates and returns a configured default volume', () => {
        expect(parseEnvironment({ ...validInput, DEFAULT_VOLUME: '0' }).defaultVolume).toBe(0);
        expect(parseEnvironment({ ...validInput, DEFAULT_VOLUME: '100' }).defaultVolume).toBe(100);
        expect(() => parseEnvironment({ ...validInput, DEFAULT_VOLUME: '101' })).toThrow(
            ConfigurationError,
        );
        expect(() => parseEnvironment({ ...validInput, DEFAULT_VOLUME: '10.5' })).toThrow(
            ConfigurationError,
        );
    });

    it('normalizes an optional YouTube region', () => {
        expect(parseEnvironment({ ...validInput, YOUTUBE_REGION: 'pt' })).toMatchObject({
            youtubeRegion: 'PT',
        });
    });

    it('includes an optional development guild ID', () => {
        expect(
            parseEnvironment({
                ...validInput,
                DISCORD_GUILD_ID: '987654321098765432',
            }),
        ).toMatchObject({ discordGuildId: '987654321098765432' });
    });

    it('reports invalid fields without exposing their values', () => {
        expect(() => parseEnvironment({})).toThrow(ConfigurationError);

        try {
            parseEnvironment({
                DISCORD_TOKEN: validInput.DISCORD_TOKEN,
                DISCORD_CLIENT_ID: 'not-a-snowflake',
            });
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(ConfigurationError);
            expect(String(error)).toContain('DISCORD_CLIENT_ID');
            expect(String(error)).not.toContain(validInput.DISCORD_TOKEN);
            expect(String(error)).not.toContain('not-a-snowflake');
        }
    });
});
