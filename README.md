# SHITBot

SHITBot is a Discord bot for coordinating movie nights. It supports:

- Creating a movie night with a date/time, location, and optional movie
- Going, maybe, and can't-go RSVPs
- Movie suggestions and one vote per person when the movie is TBD
- Organizer-controlled selection of the final movie
- Organizer-only deletion of movie nights
- Automatic closing and disabled controls when a movie night starts
- Local JSON persistence across restarts

## Requirements

- Node.js 20 or newer
- A Discord application and bot

## Discord setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. On its **Bot** page, create a bot and copy its token.
3. On **OAuth2 > URL Generator**, select the `bot` and `applications.commands` scopes.
4. Select these bot permissions: **View Channels**, **Send Messages**, **Embed Links**, and **Read Message History**.
5. Open the generated URL and add the bot to your server.
6. Enable Developer Mode in Discord, then right-click your server and choose **Copy Server ID**.

No privileged gateway intents are required.

## Run locally

```bash
npm install
cp .env.example .env
```

Fill in `.env` with the bot token, application ID, and server ID, then run:

```bash
npm run dev
```

Movie-night creation is restricted to `#movie-nights` by default. Set `MOVIE_NIGHTS_CHANNEL` in `.env` if your channel has a different name.

Use `/movie-night create`. The `when` field accepts common date/time formats, including:

```text
2026-08-15 7:30 PM
08/15/2026 19:30
2026-08-15 19:30-07:00
```

A numeric UTC offset is recommended when the bot's host may be in a different timezone.

If `movie` is omitted, suggestion and voting controls appear automatically. The organizer can close voting with **Define movie**.

## Production

```bash
npm run build
npm run start:prod
```

The default data file is `data/movie-nights.json`. Back it up or mount that directory as persistent storage when deploying in a container. Set `DATA_FILE` to change its location.

### Docker

Build and run SHITBot with persistent data:

```bash
docker build -t shitbot .
docker run --env-file .env -v shitbot-data:/app/data shitbot
```

GitHub Actions type-checks and builds pushes and pull requests targeting `master`. Every push to `master` publishes `ghcr.io/<owner>/<repository>:latest`.

## Adding commands

Create a folder at `src/commands/<command-name>/` with an `index.ts` that default-exports a `CommandFactory`. SHITBot discovers and imports command folders at runtime, so no central command list or generation step is needed. Restart the bot after adding a command.
