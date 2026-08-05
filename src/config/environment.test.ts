import { describe, expect, it } from 'vitest';

import { ConfigurationError, parseEnvironment } from './environment.js';

const validInput = {
    DISCORD_TOKEN: 'test-token-that-must-never-appear-in-errors',
    DISCORD_CLIENT_ID: '123456789012345678',
};

describe('parseEnvironment', () => {
    it('returns typed configuration for valid required values', () => {
        expect(parseEnvironment(validInput)).toEqual({
            discordToken: validInput.DISCORD_TOKEN,
            discordClientId: validInput.DISCORD_CLIENT_ID,
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

    it('accepts an optional yt-dlp executable path', () => {
        expect(
            parseEnvironment({ ...validInput, YT_DLP_PATH: 'C:\\tools\\yt-dlp.exe' }),
        ).toMatchObject({
            ytDlpPath: 'C:\\tools\\yt-dlp.exe',
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
