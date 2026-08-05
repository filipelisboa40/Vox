import { z } from 'zod';

const snowflakeSchema = z.string().regex(/^\d{17,20}$/, 'must be a valid Discord snowflake');

const environmentSchema = z.object({
    DISCORD_TOKEN: z.string().trim().min(1, 'is required'),
    DISCORD_CLIENT_ID: snowflakeSchema,
    IDLE_DISCONNECT_SECONDS: z.preprocess(
        (value) => (value === undefined || value === '' ? 300 : Number(value)),
        z.number().int().min(0),
    ),
    DISCORD_GUILD_ID: z.preprocess(
        (value) => (value === '' ? undefined : value),
        snowflakeSchema.optional(),
    ),
    YT_DLP_PATH: z.preprocess(
        (value) => (value === '' ? undefined : value),
        z.string().trim().min(1).optional(),
    ),
});

export interface Environment {
    discordToken: string;
    discordClientId: string;
    idleDisconnectMs: number;
    discordGuildId?: string;
    ytDlpPath?: string;
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
        idleDisconnectMs: result.data.IDLE_DISCONNECT_SECONDS * 1_000,
        ...(result.data.DISCORD_GUILD_ID === undefined
            ? {}
            : { discordGuildId: result.data.DISCORD_GUILD_ID }),
        ...(result.data.YT_DLP_PATH === undefined ? {} : { ytDlpPath: result.data.YT_DLP_PATH }),
    };
}

export function readEnvironment(): Environment {
    return parseEnvironment(process.env);
}
