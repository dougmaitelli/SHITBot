# SHITBot

SHITBot is a Discord bot for coordinating movie nights and other events. It supports:

- Creating a movie night with a date/time, location, and optional movie
- Going, maybe, and can't-go RSVPs
- Movie suggestions and one vote per person when the movie is TBD
- Organizer-controlled selection of the final movie
- Organizer-only deletion of movie nights
- Automatic closing and disabled controls when a movie night starts
- Local JSON persistence across restarts
- Creating named events in any server channel with a required date/time
- Optional event descriptions and links, plus Going, Maybe, and Can't-go RSVPs
- Discord scheduled-event creation and automatic closure for both event types
- Optional mention-based AI assistant with event and movie-night creation tools

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

### Required Discord permissions

The installation URL needs these OAuth2 scopes:

- `bot` adds the bot user to the server.
- `applications.commands` installs its slash commands.

Grant the bot role these permissions:

- **View Channels** lets the bot access the movie-night channel and find channels targeted by its commands.
- **Send Messages** lets it create movie-night posts, respond to commands, and send command output.
- **Embed Links** lets it display the formatted movie-night card.
- **Read Message History** lets it retrieve and update existing movie-night posts after votes, RSVPs, or automatic closure.
- **Pin Messages** lets it pin and unpin coordination posts.
- **Send Polls** lets it create native Discord polls.
- **Create Events** lets it integrate with Discord scheduled events.
- **Mention Everyone** lets it notify `@everyone`, `@here`, and otherwise non-mentionable roles when coordination requires it.

The mention-based AI assistant uses the non-privileged **Guild Messages** gateway intent. Discord exposes message content when the bot is directly mentioned, so the privileged **Message Content** intent is not required for this interaction style.

Channel-specific permission overrides still apply. Grant these permissions in `#movie-nights` and in any other channel where the bot should be able to send messages. The bot does not need **Administrator**, **Manage Messages**, **Add Reactions**, or any privileged gateway intents.

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

Times without an explicit offset use the `TZ` setting from `.env`. Inputs with a numeric UTC offset override that setting.

If `movie` is omitted, suggestion and voting controls appear automatically. The organizer can close voting with **Define movie**.

Use `/event create` in any server channel for a non-movie event. `name` and `when` are required; `description`, `link`, `duration`, and `attendance-limit` are optional. Like movie nights, the bot creates a Discord scheduled event, provides RSVP buttons, and disables RSVPs once the start time passes.

Both `/event create` and `/movie-night create` accept an optional `attendance-limit`. Once that many people have selected **Going**, additional Going responses are rejected until someone changes their response. Maybe and Can't-go responses do not count toward the limit.

## AI assistant

Set `OPENAI_BASE_URL` or `OPENAI_API_KEY` to enable the assistant, then mention the bot in a server channel and include a request. `OPENAI_API_KEY` is optional: when it is empty, the client sends no `Authorization` header, supporting local or other unauthenticated OpenAI-compatible endpoints. If only a key is provided, `OPENAI_BASE_URL` defaults to `https://api.openai.com/v1`. If neither is configured, mention handling is not registered and all non-AI bot features continue normally. `OPENAI_MODEL` defaults to `gpt-4o-mini`.

The assistant can answer short questions, create events or movie nights, list and summarize upcoming items, list items the requesting user is attending, report attendance and remaining capacity, search TMDB for movie ideas, summarize movie suggestions and voting, and post or schedule reminder messages. General event tools query the server's live Discord Scheduled Events collection, including events created manually or by other bots. Bot-created records enrich those results with Going/Maybe/Can't-go data; other Discord events expose their Interested count. General-event and movie-night listing, attendance, and reminder tools remain separate. Every movie-related command and AI tool is restricted to the configured movie-night channel. Creation uses the mentioning user as organizer and follows the same validation and persistence paths as the slash commands.

Users can mention the bot to ask what it can do in conversational mode. Its answer covers only the actions available through an `@` mention and does not advertise slash commands or unrelated bot features.

Free-form chat is limited to ordinary general knowledge. Requests to create, inspect, edit, debug, or execute code, scripts, commands, files, documents, attachments, or other executable/downloadable artifacts are rejected before reaching the AI provider. Attempts to extract hidden instructions or secrets are also rejected and still count toward rate limits.

The assistant is instructed to call tools only when a request needs current Discord data or an available action. General knowledge and ordinary conversation should be answered directly. Hard restrictions remain enforced in code: unavailable tools are never advertised, movie tools remain limited to the configured movie-night channel, and only registered tool calls can execute.

Scheduled reminders persist across restarts and are posted within about 30 seconds of their requested time. Only an event's organizer can create its public reminders, and each organizer can have up to 10 pending reminders. Reminder text cannot trigger Discord mentions.

Requests are single-turn and do not include channel history. Defaults limit prompts to 500 characters and responses to both 300 provider tokens and 1,200 displayed characters. Responses exceeding the character cap are truncated before being posted to Discord. Each user may make 5 requests and each server may make 30 requests per 5-minute window, with one request in flight per user. Configure these with `AI_MAX_INPUT_CHARACTERS`, `AI_MAX_OUTPUT_CHARACTERS`, `AI_MAX_OUTPUT_TOKENS`, `AI_USER_RATE_LIMIT`, `AI_GUILD_RATE_LIMIT`, `AI_RATE_LIMIT_WINDOW_MS`, and `AI_TIMEOUT_MS`.

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
