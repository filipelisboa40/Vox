# Vox

Vox is a Discord music bot written in TypeScript. It searches YouTube through the YouTube Data
API, obtains playable audio from a local Lavalink server, and keeps an independent queue for each
Discord server.

## Content and YouTube terms

Only play content that you are authorized to access and use. You are responsible for complying
with copyright law, the YouTube Terms of Service, Discord's terms, and the rules that apply in your
country. This project does not grant permission to copy, redistribute, archive, or bypass access
controls on any media. Do not use it to play private, paid, age-restricted, geographically blocked,
or otherwise unauthorized content.

## Requirements

- Node.js 24 or newer
- pnpm 11
- Java 17 or newer for Lavalink 4
- A Discord application and bot token
- A YouTube Data API v3 key
- Lavalink 4.2.2 with the `youtube-source` plugin

The project includes `ffmpeg-static`, so a separate FFmpeg installation is normally unnecessary.
Lavalink and its YouTube plugin must still be running before Vox can play audio.

## 1. Create the Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications), select
   **New Application**, and give it a name.
2. Open **Bot**, create the bot user, and reset/copy its token. Treat this token like a password.
3. Leave privileged gateway intents disabled. Vox only requests the standard `Guilds` and
   `Guild Voice States` intents.
4. Open **Installation**. For a private application, set the default authorization link to
   **None**; Discord rejects private applications that have a default authorization link.
5. Copy the **Application ID** from **General Information**.

Invite the bot by replacing `YOUR_APPLICATION_ID` in this URL:

```text
https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=3146752&scope=bot%20applications.commands
```

The invitation requests `View Channel`, `Connect`, and `Speak`, plus the `applications.commands`
scope. Select a server where you have permission to manage integrations. Channel-specific denies
can still prevent Vox from joining or speaking.

## 2. Configure YouTube and Lavalink

Create a Google Cloud project, enable **YouTube Data API v3**, and create an API key. Restrict the
key to that API and to the environment where practical.

Download Lavalink 4.2.2 and place `Lavalink.jar` beside
[`lavalink/application.yml`](./lavalink/application.yml). The repository also expects the
`youtube-source` plugin JAR under `lavalink/plugins/`. Ensure the password in
`lavalink/application.yml` matches `LAVALINK_PASSWORD` in `.env`.

Start Lavalink from the `lavalink` directory:

```shell
java -jar Lavalink.jar
```

Wait for `Lavalink is ready to accept connections`. If Java reports class-file version 61, an old
Java 8 runtime is being used; install Java 17 or newer and confirm with `java -version`.

## 3. Install and configure Vox

Install dependencies and create the local environment file:

```shell
pnpm install
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp` if needed. Never commit `.env`.

| Variable                  | Required | Description                                                     |
| ------------------------- | -------- | --------------------------------------------------------------- |
| `DISCORD_TOKEN`           | Yes      | Secret bot token from the Discord Developer Portal              |
| `DISCORD_CLIENT_ID`       | Yes      | Discord application ID                                          |
| `YOUTUBE_API_KEY`         | Yes      | YouTube Data API v3 key                                         |
| `LAVALINK_URL`            | Yes      | Lavalink base URL, normally `http://localhost:2333`             |
| `LAVALINK_PASSWORD`       | Yes      | Password configured in Lavalink                                 |
| `DEFAULT_VOLUME`          | No       | Initial server volume from `0` to `100`; defaults to `50`       |
| `IDLE_DISCONNECT_SECONDS` | No       | Idle time before disconnecting; defaults to `300`; `0` disables |
| `DISCORD_GUILD_ID`        | No       | Development server ID for fast guild command deployment         |
| `YOUTUBE_REGION`          | No       | Two-letter region used for YouTube search and availability      |
| `LOG_LEVEL`               | No       | Pino level such as `debug`, `info`, `warn`, or `error`          |

## 4. Deploy commands and run

For development, set `DISCORD_GUILD_ID` and deploy commands to that server:

```shell
pnpm deploy:commands
pnpm dev
```

Without `DISCORD_GUILD_ID`, deployment is global. You can also explicitly deploy globally:

```shell
pnpm deploy:commands --global
```

Guild commands normally update quickly. Global Discord command changes can take longer to appear.
For a production-style local run:

```shell
pnpm build
pnpm start
```

Press Ctrl+C to dispose players, cancel timers, disconnect voice sessions, and close Discord.

## Command reference

The user must be in a voice channel for playback commands. Control commands require the user to
share Vox's current channel.

| Command        | Options                                               | Description                                                         |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| `/play`        | `query` (required song name or supported URL)         | Finds a YouTube track and starts or queues it                       |
| `/pause`       | None                                                  | Pauses the current track                                            |
| `/resume`      | None                                                  | Resumes paused playback                                             |
| `/stop`        | None                                                  | Stops playback and clears the waiting queue, history, and loop mode |
| `/skip`        | None                                                  | Skips the current track                                             |
| `/unskip`      | None                                                  | Restores the most recently manually skipped track when possible     |
| `/next`        | None                                                  | Shows the next queued track and estimated wait                      |
| `/replay`      | None                                                  | Restarts the current track                                          |
| `/seek`        | `position` (required seconds, `MM:SS`, or `HH:MM:SS`) | Moves to an absolute track position                                 |
| `/fseek`       | `amount` (required signed seconds)                    | Moves forward or backward relative to the current position          |
| `/now-playing` | None                                                  | Shows track, progress, requester, volume, and loop state            |
| `/volume`      | `level` (required integer `0`–`100`)                  | Changes this server's player volume                                 |
| `/queue`       | `page` (optional, starts at `1`)                      | Shows a paginated waiting queue                                     |
| `/clear`       | None                                                  | Removes waiting tracks without interrupting the current track       |
| `/remove`      | `position` (required one-based queue position)        | Removes one waiting track                                           |
| `/move`        | `from`, `to` (required one-based positions)           | Reorders a waiting track                                            |
| `/shuffle`     | None                                                  | Randomizes the waiting queue                                        |
| `/loop`        | None                                                  | Toggles repetition of the current track                             |
| `/loop-queue`  | None                                                  | Toggles repetition of the complete queue                            |
| `/disconnect`  | None                                                  | Stops, clears, and disconnects Vox from voice                       |

Track loop and queue loop are mutually exclusive. Seeking depends on provider support. `/unskip`
only tracks manual skips and cannot always restore a source that has become unavailable.

## Troubleshooting

### Commands do not appear

- Run `pnpm deploy:commands` after adding or changing commands.
- Confirm `DISCORD_CLIENT_ID` belongs to the same application as `DISCORD_TOKEN`.
- Use `DISCORD_GUILD_ID` while developing and confirm the bot is installed in that server.
- Reinvite with both `bot` and `applications.commands` scopes.
- Allow more time for global command deployment.

### Vox cannot join or speak

- Join a voice channel before using `/play`.
- Grant the bot `View Channel`, `Connect`, and `Speak` on that channel.
- Check category and channel permission overrides; explicit denies override server roles.
- If a moderator moved or disconnected Vox, run `/play` again to create a fresh session.

### Tracks are unavailable or stop immediately

- Confirm Lavalink says it is ready on port `2333` and its password matches `.env`.
- Confirm the YouTube plugin loaded and the configured plugin JAR is compatible with Lavalink.
- Check that the video is public, available in `YOUTUBE_REGION`, and authorized for your use.
- Verify the YouTube API key is enabled, valid, and has remaining quota.
- If FFmpeg is reported missing, reinstall dependencies so `ffmpeg-static` is present.

### Lavalink or Java fails to start

- `Unable to access jarfile Lavalink.jar` means the JAR is missing or the terminal is in the wrong
  directory.
- Class-file version `61.0` requires Java 17; Java 8 only supports class-file version `52.0`.
- A connection reset after the bot stops a stream can be harmless; inspect the Vox log immediately
  before it for the actual playback error.

## Development checks

Run the complete quality gate before committing:

```shell
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Commands are registered explicitly in [`src/commands/index.ts`](./src/commands/index.ts), playback
state is isolated per guild, and media/provider errors are converted to safe user-facing messages.
Docker packaging is intentionally handled in the final Docker milestone.
