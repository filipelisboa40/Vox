import { z } from 'zod';

const snowflakeSchema = z.string().regex(/^\d{17,20}$/, 'must be a valid Discord snowflake');

const environmentSchema = z.object({
    DISCORD_TOKEN: z.string().trim().min(1, 'is required'),
    DISCORD_CLIENT_ID: snowflakeSchema,
    YOUTUBE_API_KEY: z.string().trim().min(1, 'is required'),
    LAVALINK_URL: z.string().trim().url('must be a valid URL'),
    LAVALINK_PASSWORD: z.string().trim().min(1, 'is required'),
    DEFAULT_VOLUME: z.preprocess(
        (value) => (value === undefined || value === '' ? 50 : Number(value)),
        z.number().int().min(0).max(100),
    ),
    IDLE_DISCONNECT_SECONDS: z.preprocess(
        (value) => (value === undefined || value === '' ? 300 : Number(value)),
        z.number().int().min(0),
    ),
    DISCORD_GUILD_ID: z.preprocess(
        (value) => (value === '' ? undefined : value),
        snowflakeSchema.optional(),
    ),
    YOUTUBE_REGION: z.preprocess(
        (value) => (value === '' ? undefined : value),
        z.string().trim().length(2).toUpperCase().optional(),
    ),
});

export interface Environment {
    discordToken: string;
    discordClientId: string;
    youtubeApiKey: string;
    lavalinkUrl: string;
    lavalinkPassword: string;
    defaultVolume: number;
    idleDisconnectMs: number;
    discordGuildId?: string;
    youtubeRegion?: string;
}

export class ConfigurationError extends Error {
    public constructor(fields: readonly string[]) {
        super(`Invalid environment configuration: ${fields.join(', ')}`);
        this.name = 'ConfigurationError';
    }
}

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
    const result = environmentSchema.safeParse(input);

    if (!result.success) {
        const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
        throw new ConfigurationError(fields);
    }

    return {
        discordToken: result.data.DISCORD_TOKEN,
        discordClientId: result.data.DISCORD_CLIENT_ID,
        youtubeApiKey: result.data.YOUTUBE_API_KEY,
        lavalinkUrl: result.data.LAVALINK_URL,
        lavalinkPassword: result.data.LAVALINK_PASSWORD,
        defaultVolume: result.data.DEFAULT_VOLUME,
        idleDisconnectMs: result.data.IDLE_DISCONNECT_SECONDS * 1_000,
        ...(result.data.DISCORD_GUILD_ID === undefined
            ? {}
            : { discordGuildId: result.data.DISCORD_GUILD_ID }),
        ...(result.data.YOUTUBE_REGION === undefined
            ? {}
            : { youtubeRegion: result.data.YOUTUBE_REGION }),
    };
}

export function readEnvironment(): Environment {
    return parseEnvironment(process.env);
}
