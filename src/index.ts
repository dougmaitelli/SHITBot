import "dotenv/config";
import { Client, Events, GatewayIntentBits, MessageFlags, REST, Routes, type Interaction } from "discord.js";
import { startAssistant } from "./assistant/index.js";
import { loadCommandFactories } from "./commands/load.js";
import { startDiscordHealthMonitor, startHealthServer } from "./discord-health.js";
import { logger } from "./logger.js";
import { startReminderJob } from "./reminders/index.js";
import { BotStore } from "./store.js";
import type { AssistantTool } from "./assistant/types.js";
import type { CommandContext, CommandModule } from "./commands/types.js";

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

async function reportInteractionError(interaction: Interaction, error: unknown): Promise<void> {
  logger.error("Interaction failed", {
    error,
    interactionId: interaction.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    commandName: interaction.isCommand() ? interaction.commandName : undefined,
  });
  if (!interaction.isRepliable()) return;

  const message = {
    content: "Something went wrong while handling that action.",
    flags: MessageFlags.Ephemeral,
  } as const;
  try {
    if (interaction.replied || interaction.deferred) await interaction.followUp(message);
    else await interaction.reply(message);
  } catch (notificationError) {
    logger.error("Could not notify user about interaction failure", {
      interactionId: interaction.id,
      notificationError,
    });
  }
}

const token = requiredEnv("DISCORD_TOKEN");
const clientId = requiredEnv("DISCORD_CLIENT_ID");
const guildId = process.env.DISCORD_GUILD_ID;
const store = new BotStore(process.env.DATA_FILE ?? "./data/movie-nights.json");
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
startHealthServer(client, positiveIntegerEnv("HEALTH_PORT", 3000));
startDiscordHealthMonitor(
  client,
  positiveIntegerEnv("DISCORD_UNREADY_EXIT_MS", 5 * 60_000),
  positiveIntegerEnv("BOT_HEARTBEAT_MS", 5 * 60_000),
);
const commandFactories = await loadCommandFactories();
const assistantTools: AssistantTool[] = [];

const commandContext: CommandContext = {
  client,
  store,
  assistantTools,
  config: {
    timeZone: process.env.TZ ?? "America/Los_Angeles",
    movieNightsChannel: process.env.MOVIE_NIGHTS_CHANNEL ?? "movie-nights",
    tmdbApiToken: requiredEnv("TMDB_API_TOKEN"),
  },
};
const commandModules: CommandModule[] = commandFactories.map((createCommand) => createCommand(commandContext));
const commandsByName = new Map(commandModules.map((command) => [command.data.name, command]));

const openAIApiKey = process.env.OPENAI_API_KEY;
const openAIBaseUrl = process.env.OPENAI_BASE_URL;
if (openAIBaseUrl || openAIApiKey) {
  startAssistant(client, assistantTools, {
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
    timeZone: commandContext.config.timeZone,
  });
} else {
  logger.info("AI assistant disabled", { reason: "OPENAI_BASE_URL and OPENAI_API_KEY are not configured" });
}

client.on(Events.Error, (error) => logger.error("Discord client error", { error }));
client.on(Events.Warn, (warning) => logger.warn("Discord client warning", { warning }));
client.on(Events.ShardError, (error, shardId) => logger.error("Discord shard error", { error, shardId }));
client.on(Events.ShardDisconnect, (event, shardId) =>
  logger.warn("Discord shard disconnected", { shardId, code: event.code, reason: event.reason }),
);
client.on(Events.ShardReconnecting, (shardId) => logger.info("Discord shard reconnecting", { shardId }));
client.on(Events.ShardReady, (shardId, unavailableGuilds) =>
  logger.info("Discord shard ready", { shardId, unavailableGuildCount: unavailableGuilds?.size ?? 0 }),
);
client.on(Events.Invalidated, () => {
  logger.fatal("Discord session invalidated; exiting for container restart");
  process.exit(1);
});

async function handleInteraction(interaction: Interaction): Promise<void> {
  const startedAt = Date.now();
  const interactionContext = {
    interactionId: interaction.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    kind: interaction.type,
    commandName: interaction.isCommand() ? interaction.commandName : undefined,
  };
  logger.info("Interaction received", interactionContext);
  try {
    if (interaction.isChatInputCommand()) {
      const command = commandsByName.get(interaction.commandName);
      if (!command) logger.warn("No handler registered for command", interactionContext);
      else await command.execute(interaction);
      logger.info("Interaction completed", { ...interactionContext, durationMs: Date.now() - startedAt });
      return;
    }

    for (const command of commandModules) {
      if (await command.handleInteraction?.(interaction)) {
        logger.info("Interaction completed", { ...interactionContext, durationMs: Date.now() - startedAt });
        return;
      }
    }
    logger.warn("No handler accepted interaction", { ...interactionContext, durationMs: Date.now() - startedAt });
  } catch (error) {
    await reportInteractionError(interaction, error);
  }
}
client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction).catch((error: unknown) =>
    logger.fatal("Interaction error handler failed", { error, interactionId: interaction.id }),
  );
});

client.once(Events.ClientReady, (readyClient) => {
  void (async () => {
    try {
      logger.info("Discord client ready", { userTag: readyClient.user.tag, guildCount: readyClient.guilds.cache.size });
      for (const command of commandModules) await command.onReady?.();
      startReminderJob(client, store);
      logger.info("Background jobs started");
    } catch (error) {
      logger.fatal("Ready initialization failed", { error });
      process.exit(1);
    }
  })().catch((error: unknown) => {
    logger.fatal("Ready error handler failed", { error });
    process.exit(1);
  });
});

await store.load();
logger.info("Data store loaded", { dataFile: process.env.DATA_FILE ?? "./data/movie-nights.json" });
const rest = new REST().setToken(token);
const commandData = commandModules.map((command) => command.data);
if (guildId) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
  logger.info("Registered guild commands", { guildId, commandCount: commandData.length });
} else {
  await rest.put(Routes.applicationCommands(clientId), { body: commandData });
  logger.info("Registered global commands", { commandCount: commandData.length });
}
logger.info("Logging in to Discord");
await client.login(token);
