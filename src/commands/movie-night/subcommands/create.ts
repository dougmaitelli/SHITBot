import { MessageFlags } from "discord.js";
import { logger } from "../../../logger.js";
import { parseDate } from "../../../utils/date-parser.js";
import { createMovieNight } from "../actions/create.js";
import { isMovieNightChannel } from "../channel-policy.js";
import type { SubcommandSchema } from "../../command-schema.js";
import type { CommandContext, GuildCommandInteraction } from "../../types.js";

export const createMovieNightSchema: SubcommandSchema = {
  name: "create",
  description: "Create a new movie night",
  options: [
    {
      type: "string",
      name: "when",
      description: "Date and time, e.g. 2026-08-15 7:30 PM or 08/15/2026 19:30",
      maxLength: 100,
      required: true,
    },
    {
      type: "string",
      name: "location",
      description: "Where the movie night is happening",
      maxLength: 200,
      required: true,
    },
    {
      type: "string",
      name: "movie",
      description: "Movie title; omit it to let people suggest and vote",
      maxLength: 100,
    },
    {
      type: "integer",
      name: "duration",
      description: "Duration in minutes (default: 180)",
      minValue: 30,
      maxValue: 720,
    },
    {
      type: "integer",
      name: "attendance-limit",
      description: "Maximum number of people who can RSVP Going",
      minValue: 1,
      maxValue: 100000,
    },
  ],
};

export function createMovieNightHandler({ client, store, config }: CommandContext, channelName: string) {
  return async (interaction: GuildCommandInteraction): Promise<void> => {
    if (!isMovieNightChannel(interaction.channel?.name, channelName)) {
      const configuredChannel = interaction.guild.channels.cache.find((channel) => channel.name === channelName);

      await interaction.reply({
        content: `Movie nights can only be created in ${configuredChannel ? `<#${configuredChannel.id}>` : `#${channelName}`}.`,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const startsAt = parseDate(interaction.options.getString("when", true), config.timeZone);

    if (!startsAt) {
      await interaction.reply({
        content:
          "I couldn't understand that date and time. Try `2 october 7pm`, `08/15/2026 19:30`, or `2026-08-15 19:30-07:00`.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    if (startsAt <= Math.floor(Date.now() / 1000)) {
      await interaction.reply({
        content: "The movie night must be scheduled in the future.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const movie = interaction.options.getString("movie")?.trim() || null;

    await interaction.deferReply();
    try {
      await createMovieNight(
        client,
        store,
        {
          guild: interaction.guild,
          channelId: interaction.channelId,
          creatorId: interaction.user.id,
          startsAt,
          location: interaction.options.getString("location", true).trim(),
          movie,
          attendanceLimit: interaction.options.getInteger("attendance-limit") ?? undefined,
          durationMinutes: interaction.options.getInteger("duration") ?? 180,
        },
        (options) => interaction.editReply(options),
      );
    } catch (error) {
      logger.error("Could not create movie night", {
        error,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
      });
      await interaction.deleteReply().catch(() => undefined);
      await interaction.followUp({
        content:
          "I couldn't create the movie night. Check my channel, **Create Events**, and **Manage Messages** permissions.",
        flags: MessageFlags.Ephemeral,
      });
    }
  };
}
