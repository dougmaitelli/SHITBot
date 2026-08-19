import {
  Client,
  Events,
  GatewayIntentBits,
  InteractionContextType,
  MessageFlags,
  REST,
  Routes,
  type Interaction,
} from "discord.js";
import { startAssistant, type AssistantConfig } from "./assistant/index.js";
import { deleteExpiredRecords, startCleanupJob } from "./cleanup.js";
import { loadCommandFactories } from "./commands/load.js";
import { startDiscordHealthMonitor, startHealthServer } from "./discord-health.js";
import { logger } from "./logger.js";
import { startReminderJob } from "./reminders/index.js";
import { BotStore } from "./store.js";
import type { AssistantTool } from "./assistant/types.js";
import type { CommandConfig, CommandContext, CommandModule, GuildCommandInteraction } from "./commands/types.js";

export interface BotConfig {
  token: string;
  clientId: string;
  guildId?: string;
  dataFile: string;
  healthPort: number;
  discordUnreadyExitMs: number;
  heartbeatMs: number;
  commands: CommandConfig;
  assistant?: AssistantConfig;
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

function isGuildCommandInteraction(interaction: Interaction): interaction is GuildCommandInteraction {
  return interaction.isChatInputCommand() && interaction.inCachedGuild() && Boolean(interaction.channel?.isSendable());
}

function registerClientLogging(client: Client): void {
  client.on(Events.Error, (error) => logger.error("Discord client error", { error }));
  client.on(Events.Warn, (warning) => logger.warn("Discord client warning", { warning }));
  client.on(Events.ShardError, (error, shardId) => logger.error("Discord shard error", { error, shardId }));
  client.on(Events.ShardDisconnect, (event, shardId) =>
    logger.warn("Discord shard disconnected", { shardId, code: event.code, reason: event.reason }),
  );
  client.on(Events.ShardReconnecting, (shardId) => logger.info("Discord shard reconnecting", { shardId }));
  client.on(Events.ShardReady, (shardId, unavailableGuilds) =>
    logger.info("Discord shard ready", {
      shardId,
      unavailableGuildCount: unavailableGuilds?.size ?? 0,
    }),
  );
  client.on(Events.Invalidated, () => {
    logger.fatal("Discord session invalidated; exiting for container restart");
    process.exit(1);
  });
}

function registerInteractionHandler(client: Client, commandModules: CommandModule[]): void {
  const commandsByName = new Map(commandModules.map((command) => [command.data.name, command]));

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
        else if (!isGuildCommandInteraction(interaction)) {
          await interaction.reply({
            content: "Commands can only be used in a server channel where I can send messages.",
            flags: MessageFlags.Ephemeral,
          });
        } else await command.execute(interaction);

        logger.info("Interaction completed", { ...interactionContext, durationMs: Date.now() - startedAt });

        return;
      }

      for (const command of commandModules) {
        if (await command.handleInteraction?.(interaction)) {
          logger.info("Interaction completed", { ...interactionContext, durationMs: Date.now() - startedAt });

          return;
        }
      }

      logger.warn("No handler accepted interaction", {
        ...interactionContext,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      await reportInteractionError(interaction, error);
    }
  }

  client.on(Events.InteractionCreate, (interaction) => {
    void handleInteraction(interaction).catch((error: unknown) =>
      logger.fatal("Interaction error handler failed", { error, interactionId: interaction.id }),
    );
  });
}

function registerReadyHandler(client: Client, store: BotStore, commandModules: CommandModule[]): void {
  client.once(Events.ClientReady, (readyClient) => {
    void (async () => {
      try {
        logger.info("Discord client ready", {
          userTag: readyClient.user.tag,
          guildCount: readyClient.guilds.cache.size,
        });

        const deleted = await deleteExpiredRecords(store);

        if (deleted.events || deleted.movieNights) logger.info("Deleted expired records", deleted);

        for (const command of commandModules) await command.onReady?.();

        startReminderJob(client, store);
        startCleanupJob(store);
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
}

async function registerCommands(config: BotConfig, commandModules: CommandModule[]): Promise<void> {
  const rest = new REST().setToken(config.token);
  const commandData = commandModules.map((command) => ({
    ...command.data,
    contexts: [InteractionContextType.Guild],
  }));

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commandData });
    logger.info("Registered guild commands", { guildId: config.guildId, commandCount: commandData.length });
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body: commandData });
    logger.info("Registered global commands", { commandCount: commandData.length });
  }
}

export async function startBot(config: BotConfig): Promise<void> {
  const store = new BotStore(config.dataFile);
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];

  if (config.assistant) intents.push(GatewayIntentBits.MessageContent);

  const client = new Client({
    intents,
  });

  startHealthServer(client, config.healthPort);
  startDiscordHealthMonitor(client, config.discordUnreadyExitMs, config.heartbeatMs);

  const commandFactories = await loadCommandFactories();
  const assistantTools: AssistantTool[] = [];
  const commandContext: CommandContext = {
    client,
    store,
    config: config.commands,
    registerAssistantTools(...tools): void {
      assistantTools.push(...tools);
    },
  };
  const commandModules = commandFactories.map((createCommand) => createCommand(commandContext));

  if (config.assistant) startAssistant(client, assistantTools, config.assistant);
  else logger.info("AI assistant disabled", { reason: "OPENAI_BASE_URL and OPENAI_API_KEY are not configured" });

  registerClientLogging(client);
  registerInteractionHandler(client, commandModules);
  registerReadyHandler(client, store, commandModules);

  await store.load();
  logger.info("Data store loaded", { dataFile: config.dataFile });

  for (const commandModule of commandModules) await commandModule.onStoreLoaded?.();

  await registerCommands(config, commandModules);

  logger.info("Logging in to Discord");
  await client.login(config.token);
}
