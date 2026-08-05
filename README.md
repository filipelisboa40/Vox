<div align="center">

# Vox

### A lightweight, self-hosted Discord music bot built for YouTube

[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Raspberry Pi](https://img.shields.io/badge/Raspberry%20Pi-optimized-C51A4A?logo=raspberrypi&logoColor=white)](https://www.raspberrypi.com/)

YouTube search · Per-server queues · Direct Opus playback · Raspberry Pi friendly

[Quick start](#quick-start) · [Commands](#commands) · [Configuration](#configuration) · [Development](#development)

</div>

Vox is a TypeScript Discord music bot powered by `yt-dlp`. It requests WebM/Opus audio and sends
it directly to Discord without live transcoding during normal playback. Every Discord server gets
an independent player, queue, history, and loop state.

## Features

- Search YouTube or play a YouTube URL with `/play`.
- Pause, resume, replay, seek, skip, and restore skipped tracks.
- Reorder, remove, clear, shuffle, and inspect the queue.
- Loop one track or the complete queue.
- Automatically disconnect when inactive.
- Run without Lavalink, Java, Spotify credentials, or a YouTube API key.
- Use a small multi-platform Docker image on `amd64` and Raspberry Pi `arm64`.
- Constrain memory, CPU, processes, privileges, temporary storage, and logs.

## Quick start

You need a Discord bot token and its application ID. Start the latest published image with one
command:

```bash
docker run -it --pull always \
  -e DISCORD_TOKEN='YOUR_TOKEN' \
  -e DISCORD_CLIENT_ID='YOUR_APPLICATION_ID' \
  ghcr.io/filipelisboa40/vox:latest
```

Docker downloads the prebuilt image automatically. You do not need to clone this repository or
install Node.js, FFmpeg, or yt-dlp on the host.

> [!TIP]
> Replace `-it` with `-d --name vox --restart unless-stopped` to run Vox continuously in the
> background.

For the Raspberry Pi resource and security limits used by this project:

```bash
docker run -d --pull always \
  --name vox \
  --restart unless-stopped \
  -e DISCORD_TOKEN='YOUR_TOKEN' \
  -e DISCORD_CLIENT_ID='YOUR_APPLICATION_ID' \
  --memory 512m \
  --memory-reservation 256m \
  --cpus 2 \
  --pids-limit 64 \
  --read-only \
  --tmpfs /tmp:size=64m,mode=1777 \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --log-opt max-size=5m \
  --log-opt max-file=2 \
  ghcr.io/filipelisboa40/vox:latest
```

Follow or stop the background container with:

```bash
docker logs --follow vox
docker stop vox
```

## Create and invite the Discord bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create an
   application.
2. Open **Bot**, create the bot user, and copy its token. Treat the token like a password.
3. Copy the **Application ID** from **General Information**.
4. For a private application, open **Installation** and set the default authorization link to
   **None**.
5. Replace `YOUR_APPLICATION_ID` in the URL below and open it:

```text
https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=3146752&scope=bot%20applications.commands
```

The invitation requests `View Channel`, `Connect`, and `Speak`, together with the
`applications.commands` scope.

## Configuration

For longer commands and production deployments, keep secrets in `.env` and pass
`--env-file .env` instead of individual `-e` arguments.

| Variable                  | Required | Description                                                     |
| ------------------------- | -------- | --------------------------------------------------------------- |
| `DISCORD_TOKEN`           | Yes      | Secret token from the Discord Developer Portal                  |
| `DISCORD_CLIENT_ID`       | Yes      | Discord application ID                                          |
| `DISCORD_GUILD_ID`        | No       | Development server ID for fast guild command deployment         |
| `IDLE_DISCONNECT_SECONDS` | No       | Idle time before disconnecting; defaults to `300`; `0` disables |
| `YT_DLP_PATH`             | No       | Custom yt-dlp executable; the container configures this         |
| `LOG_LEVEL`               | No       | Pino level: `debug`, `info`, `warn`, or `error`                 |

Vox does not persist queues or settings, so no `/data` volume is required.

## Commands

The user must be in a voice channel. Playback controls require the user to share Vox's current
voice channel.

| Command        | Options                                      | Description                                                     |
| -------------- | -------------------------------------------- | --------------------------------------------------------------- |
| `/play`        | `query` — song name or supported URL         | Finds a YouTube track and starts or queues it                   |
| `/pause`       | None                                         | Pauses playback                                                 |
| `/resume`      | None                                         | Resumes paused playback                                         |
| `/stop`        | None                                         | Stops playback and clears queue, history, and loop state        |
| `/skip`        | None                                         | Skips the current track                                         |
| `/unskip`      | None                                         | Restores the most recently manually skipped track when possible |
| `/next`        | None                                         | Shows the next track and estimated wait                         |
| `/replay`      | None                                         | Restarts the current track                                      |
| `/seek`        | `position` — seconds, `MM:SS`, or `HH:MM:SS` | Moves to an absolute position                                   |
| `/fseek`       | `amount` — signed seconds                    | Moves forward or backward                                       |
| `/now-playing` | None                                         | Shows track, progress, requester, and loop state                |
| `/queue`       | `page` — optional page number                | Shows the waiting queue                                         |
| `/clear`       | None                                         | Removes waiting tracks without stopping the current track       |
| `/remove`      | `position` — one-based queue position        | Removes a waiting track                                         |
| `/move`        | `from`, `to` — one-based positions           | Reorders a waiting track                                        |
| `/shuffle`     | None                                         | Randomizes the queue                                            |
| `/loop`        | None                                         | Toggles current-track looping                                   |
| `/loop-queue`  | None                                         | Toggles complete-queue looping                                  |
| `/disconnect`  | None                                         | Stops, clears, and disconnects Vox                              |

Track and queue looping are mutually exclusive. `/volume` is intentionally unavailable because
software volume processing would disable direct Opus playback; listeners can use Discord's local
volume control.

## Docker Compose

Clone the project if you want to build the image yourself:

```bash
git clone https://github.com/filipelisboa40/Vox.git
cd Vox
cp .env.example .env
# Edit .env before continuing.
docker compose up -d --build
docker compose logs --follow
```

The production image contains Node.js 24, FFmpeg, and a checksum-verified yt-dlp executable. It
runs as a non-root user and supports `linux/amd64` and `linux/arm64`.

Convenience launchers are also available:

```bash
sh scripts/run-docker.sh
```

```powershell
.\scripts\run-docker.ps1
```

## Development

### Requirements

- Node.js 24 or newer
- pnpm 11
- FFmpeg on `PATH`
- yt-dlp on `PATH`

### Install and run

```bash
pnpm install
cp .env.example .env
pnpm deploy:commands
pnpm dev
```

Set `DISCORD_GUILD_ID` for fast guild-scoped command deployment. Without it, commands are deployed
globally and may take longer to appear.

Production-style local run:

```bash
pnpm build
pnpm start
```

### Quality checks

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

## Troubleshooting

<details>
<summary><strong>Commands do not appear</strong></summary>

- Run `pnpm deploy:commands` after command changes.
- Confirm the client ID and token belong to the same Discord application.
- Confirm Vox was invited with both `bot` and `applications.commands` scopes.
- Guild commands update quickly; global commands can take longer.

</details>

<details>
<summary><strong>Vox cannot join or speak</strong></summary>

- Join a voice channel before using `/play`.
- Grant Vox `View Channel`, `Connect`, and `Speak` permissions.
- Check category and channel permission overrides.

</details>

<details>
<summary><strong>Tracks are unavailable or stop immediately</strong></summary>

- Update yt-dlp because YouTube extractor behavior changes regularly.
- Confirm the video is public and available in your region.
- Check container output with `docker logs vox`.
- Seeking requires FFmpeg, which is already included in the published image.

</details>

## Responsible use

Only play content you are authorized to access and use. You are responsible for complying with
copyright law, the YouTube Terms of Service, Discord's terms, and applicable local rules. Vox does
not grant permission to copy, redistribute, archive, or bypass access controls on media.

---

<div align="center">

Built with TypeScript, discord.js, yt-dlp, and far too many songs in the queue.

</div>
