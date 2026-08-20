import { logger } from "../../logger.js";
import { buildCommand } from "../command-schema.js";
import { createMovieNightAssistantTools } from "./assistant-tools/index.js";
import { isMovieNightChannel } from "./channel-policy.js";
import { startExpirationJob } from "./expiration-job.js";
import { createMovieNightInteractionHandler } from "./interactions/index.js";
import { createMovieNightMessageService } from "./messages.js";
import { createMovieNightHandler, createMovieNightSchema } from "./subcommands/create.js";
import { editMovieNightHandler, editMovieNightSchema } from "./subcommands/edit.js";
import { TmdbClient } from "./tmdb.js";
import type { CommandFactory, CommandModule, GuildCommandInteraction } from "../types.js";

const createMovieNightCommand: CommandFactory = (context): CommandModule => {
  const { client, store, config } = context;
  const channelName = config.movieNightsChannel.replace(/^#/, "");
  const tmdb = new TmdbClient(config.tmdbApiToken);
  const messages = createMovieNightMessageService(client);
  const subcommands = new Map([
    ["create", createMovieNightHandler(context, channelName)],
    ["edit", editMovieNightHandler(context, messages)],
  ]);

  async function requireMovieChannel(channelId: string) {
    const channel = await client.channels.fetch(channelId);

    if (
      !channel?.isTextBased() ||
      channel.isDMBased() ||
      !channel.isSendable() ||
      !isMovieNightChannel(channel.name, channelName)
    ) {
      throw new Error(`Movie features can only be used in #${channelName}.`);
    }

    return channel;
  }

  context.registerAssistantTools(
    ...createMovieNightAssistantTools(
      client,
      store,
      config.timeZone,
      requireMovieChannel,
      channelName,
      tmdb,
      config.roles,
    ),
  );

  return {
    data: buildCommand({
      name: "movie-night",
      description: "Organize a movie night",
      subcommands: [createMovieNightSchema, editMovieNightSchema],
    }),
    async execute(interaction: GuildCommandInteraction): Promise<void> {
      await subcommands.get(interaction.options.getSubcommand())?.(interaction);
    },
    handleInteraction: createMovieNightInteractionHandler(context, messages, tmdb),
    onStoreLoaded(): void {
      logger.info("Movie-night module store loaded", { movieNightCount: store.list().length });
    },
    async onReady(): Promise<void> {
      for (const night of store.list()) {
        await messages.updateNight(night).catch((error) =>
          logger.warn("Could not reconcile movie-night message", {
            error,
            nightId: night.id,
            channelId: night.channelId,
            messageId: night.messageId,
          }),
        );
        await messages.reconcilePin(night).catch((error) =>
          logger.warn("Could not reconcile movie-night message pin", {
            error,
            nightId: night.id,
            channelId: night.channelId,
            messageId: night.messageId,
          }),
        );
      }

      startExpirationJob(store, (night) => messages.updateAll(night));
    },
  };
};

export default createMovieNightCommand;
