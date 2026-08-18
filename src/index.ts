import "dotenv/config";
import { startBot, type BotConfig } from "./bot.js";
import { logger } from "./logger.js";

process.on("unhandledRejection", (error) => {
  logger.fatal("Unhandled promise rejection", { error });
  process.exit(1);
});
process.on("uncaughtException", (error) => {
  logger.fatal("Uncaught exception", { error });
  process.exit(1);
});

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) throw new Error(`Missing required environment variable: ${name}`);

  return value;
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) return fallback;

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);

  return value;
}

const openAIApiKey = process.env.OPENAI_API_KEY;
const openAIBaseUrl = process.env.OPENAI_BASE_URL;
const timeZone = process.env.TZ ?? "America/Los_Angeles";
const config: BotConfig = {
  token: requiredEnv("DISCORD_TOKEN"),
  clientId: requiredEnv("DISCORD_CLIENT_ID"),
  guildId: process.env.DISCORD_GUILD_ID,
  dataFile: process.env.DATA_FILE ?? "./data/movie-nights.json",
  healthPort: positiveIntegerEnv("HEALTH_PORT", 3000),
  discordUnreadyExitMs: positiveIntegerEnv("DISCORD_UNREADY_EXIT_MS", 5 * 60_000),
  heartbeatMs: positiveIntegerEnv("BOT_HEARTBEAT_MS", 5 * 60_000),
  commands: {
    timeZone,
    movieNightsChannel: process.env.MOVIE_NIGHTS_CHANNEL ?? "movie-nights",
    tmdbApiToken: requiredEnv("TMDB_API_TOKEN"),
    roles: {
      moderatorRoleId: process.env.MODERATOR_ROLE_ID ?? "",
      adminRoleId: process.env.ADMIN_ROLE_ID ?? "",
    },
  },
  ...(openAIBaseUrl || openAIApiKey
    ? {
        assistant: {
          apiKey: openAIApiKey,
          baseUrl: openAIBaseUrl ?? "https://api.openai.com/v1",
          model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
          maxInputCharacters: positiveIntegerEnv("AI_MAX_INPUT_CHARACTERS", 500),
          maxOutputCharacters: positiveIntegerEnv("AI_MAX_OUTPUT_CHARACTERS", 1600),
          maxOutputTokens: positiveIntegerEnv("AI_MAX_OUTPUT_TOKENS", 400),
          userRequestsPerWindow: positiveIntegerEnv("AI_USER_RATE_LIMIT", 5),
          guildRequestsPerWindow: positiveIntegerEnv("AI_GUILD_RATE_LIMIT", 30),
          rateLimitWindowMs: positiveIntegerEnv("AI_RATE_LIMIT_WINDOW_MS", 5 * 60_000),
          timeoutMs: positiveIntegerEnv("AI_TIMEOUT_MS", 30_000),
          timeZone,
        },
      }
    : {}),
};

await startBot(config);
