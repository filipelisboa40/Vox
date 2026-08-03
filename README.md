# Vox

Vox is a Discord music bot written in TypeScript.

## Requirements

- Node.js 24 or newer
- pnpm 11

## Development

Install dependencies:

```shell
pnpm install
```

Run the development entry point with automatic restarts:

```shell
pnpm dev
```

## Quality checks

```shell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The compiled application is written to `dist/` and can be run with `pnpm start`.

## Configuration

Copy `.env.example` to `.env` and provide the Discord application values from the
[Discord Developer Portal](https://discord.com/developers/applications). Never commit `.env`.

| Variable            | Required | Description                                      |
| ------------------- | -------- | ------------------------------------------------ |
| `DISCORD_TOKEN`     | Yes      | Secret bot token                                 |
| `DISCORD_CLIENT_ID` | Yes      | Discord application ID                           |
| `DISCORD_GUILD_ID`  | No       | Development server ID for future command deploys |
| `LOG_LEVEL`         | No       | Pino logging level; defaults to `info`           |

Start the bot with `pnpm dev`. Press Ctrl+C to destroy the Discord client and exit cleanly.

## Slash commands

Commands are explicitly registered in `src/commands/index.ts`. After adding a command, deploy it to
the configured development guild:

```shell
pnpm deploy:commands
```

If `DISCORD_GUILD_ID` is absent, deployment is global. You can also explicitly request global
deployment with `pnpm deploy:commands --global`. Global command updates can take longer to appear
in Discord than development-guild updates.
