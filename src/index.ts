import "dotenv/config";
import { Client, Events, GatewayIntentBits, MessageFlags, REST, Routes, type Interaction } from "discord.js";
import { loadCommandFactories } from "./commands/load.js";
import type { CommandContext, CommandModule } from "./commands/types.js";
import { BotStore } from "./store.js";
import { startAssistant } from "./assistant/index.js";
import type { AssistantTool } from "./assistant/types.js";
import { startReminderJob } from "./reminders/index.js";

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
  console.error("Interaction failed", error);
  if (!interaction.isRepliable()) return;

  const message = { content: "Something went wrong while handling that action.", flags: MessageFlags.Ephemeral } as const;
  if (interaction.replied || interaction.deferred) await interaction.followUp(message).catch(() => undefined);
  else await interaction.reply(message).catch(() => undefined);
}

const token = requiredEnv("DISCORD_TOKEN");
const clientId = requiredEnv("DISCORD_CLIENT_ID");
const guildId = process.env.DISCORD_GUILD_ID;
const store = new BotStore(process.env.DATA_FILE ?? "./data/movie-nights.json");
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
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
  console.log("AI assistant disabled: OPENAI_BASE_URL and OPENAI_API_KEY are not configured");
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await commandsByName.get(interaction.commandName)?.execute(interaction);
      return;
    }

    for (const command of commandModules) {
      if (await command.handleInteraction?.(interaction)) return;
    }
  } catch (error) {
    await reportInteractionError(interaction, error);
  }
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Ready as ${readyClient.user.tag}`);
  for (const command of commandModules) await command.onReady?.();
  startReminderJob(client, store);
});

await store.load();
const rest = new REST().setToken(token);
const commandData = commandModules.map((command) => command.data);
if (guildId) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });
  console.log(`Registered commands in guild ${guildId}`);
} else {
  await rest.put(Routes.applicationCommands(clientId), { body: commandData });
  console.log("Registered global commands (Discord may take up to an hour to publish them)");
}
await client.login(token);
