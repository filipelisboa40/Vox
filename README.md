# Vox

Vox is a Discord music bot written in TypeScript.

## Requirements

- Node.js 24 or newer
- pnpm 11
- FFmpeg available on `PATH` for sources that require transcoding

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

| Variable            | Required | Description                                          |
| ------------------- | -------- | ---------------------------------------------------- |
| `DISCORD_TOKEN`     | Yes      | Secret bot token                                     |
| `DISCORD_CLIENT_ID` | Yes      | Discord application ID                               |
| `YOUTUBE_API_KEY`   | Yes      | YouTube Data API v3 key for search and metadata      |
| `LAVALINK_URL`      | Yes      | Base URL of the Lavalink media server                |
| `LAVALINK_PASSWORD` | Yes      | Password configured on the Lavalink server           |
| `DEFAULT_VOLUME`    | No       | Initial per-server volume from 0–100; defaults to 50 |
| `DISCORD_GUILD_ID`  | No       | Development server ID for future command deploys     |
| `YOUTUBE_REGION`    | No       | Two-letter region for search and availability checks |
| `LOG_LEVEL`         | No       | Pino logging level; defaults to `info`               |

## Lavalink

YouTube metadata comes from the YouTube Data API, while playable audio comes from a
Lavalink server using the `youtube-source` plugin. Download Lavalink `4.2.2`, place
[`lavalink/application.yml`](./lavalink/application.yml) beside `Lavalink.jar`, set the same
password in that file and `.env`, then start it before the bot:

```text
java -jar Lavalink.jar
```

The Docker milestone will run this server and the bot together. The current configuration is
also usable for local development without Docker.

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
