import "dotenv/config";
import { Client, Events, GatewayIntentBits, MessageFlags, REST, Routes, type Interaction } from "discord.js";
import { loadCommandFactories } from "./commands/load.js";
import type { CommandContext, CommandModule } from "./commands/types.js";
import { BotStore } from "./store.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
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
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commandFactories = await loadCommandFactories();

const commandContext: CommandContext = {
  client,
  store,
  config: {
    timeZone: process.env.TZ ?? "America/Los_Angeles",
    movieNightsChannel: process.env.MOVIE_NIGHTS_CHANNEL ?? "movie-nights",
    tmdbApiToken: requiredEnv("TMDB_API_TOKEN"),
  },
};
const commandModules: CommandModule[] = commandFactories.map((createCommand) => createCommand(commandContext));
const commandsByName = new Map(commandModules.map((command) => [command.data.name, command]));

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
