import { MessageFlags } from "discord.js";
import { isOrganizerOrModerator } from "../../../authorization.js";
import { logger } from "../../../logger.js";
import { parseDate } from "../../../utils/date-parser.js";
import { parseScheduledEventReference } from "../../event/actions/import.js";
import { editMovieNight } from "../actions/edit.js";
import { isMovieNightClosed } from "../status.js";
import type { SubcommandSchema } from "../../command-schema.js";
import type { CommandContext, GuildCommandInteraction } from "../../types.js";
import type { MovieNightMessageService } from "../messages.js";

export const editMovieNightSchema: SubcommandSchema = {
  name: "edit",
  description: "Edit a managed movie night",
  options: [
    {
      type: "string",
      name: "movie-night-id",
      description: "Bot movie-night ID, Discord event ID, or event link",
      maxLength: 300,
      required: true,
    },
    { type: "string", name: "when", description: "New date and time", maxLength: 100 },
    { type: "string", name: "location", description: "New location", maxLength: 200 },
    { type: "string", name: "movie", description: "New movie; blank reopens voting", maxLength: 100 },
    { type: "integer", name: "duration", description: "Duration in minutes", minValue: 30, maxValue: 720 },
    {
      type: "integer",
      name: "attendance-limit",
      description: "Maximum Going RSVPs",
      minValue: 1,
      maxValue: 100000,
    },
  ],
};

export function editMovieNightHandler({ client, store, config }: CommandContext, messages: MovieNightMessageService) {
  return async (interaction: GuildCommandInteraction): Promise<void> => {
    const reference = interaction.options.getString("movie-night-id", true).trim();
    let night = store.get(reference.replace(/^movie-night:/, ""));

    if (!night) {
      try {
        const scheduledId = parseScheduledEventReference(reference, interaction.guildId);

        night = store
          .list()
          .find((candidate) => candidate.guildId === interaction.guildId && candidate.scheduledEventId === scheduledId);
      } catch {
        // The reference may be a short bot movie-night ID.
      }
    }

    if (!night || night.guildId !== interaction.guildId) {
      await interaction.reply({ content: "I couldn't find that managed movie night.", flags: MessageFlags.Ephemeral });

      return;
    }

    if (isMovieNightClosed(night)) {
      await interaction.reply({
        content: "This movie night has started and is no longer editable.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    if (!(await isOrganizerOrModerator(interaction.guild, interaction.user.id, night.creatorId, config.roles))) {
      await interaction.reply({
        content: "Only the organizer or a moderator can edit this movie night.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const whenInput = interaction.options.getString("when");
    const locationInput = interaction.options.getString("location");
    const movieInput = interaction.options.getString("movie");
    const durationInput = interaction.options.getInteger("duration");
    const attendanceInput = interaction.options.getInteger("attendance-limit");

    if ([whenInput, locationInput, movieInput, durationInput, attendanceInput].every((value) => value === null)) {
      await interaction.reply({ content: "Provide at least one field to edit.", flags: MessageFlags.Ephemeral });

      return;
    }

    const startsAt = whenInput === null ? night.startsAt : parseDate(whenInput, config.timeZone);

    if (!startsAt || startsAt <= Math.floor(Date.now() / 1000)) {
      await interaction.reply({ content: "Provide a valid future date and time.", flags: MessageFlags.Ephemeral });

      return;
    }

    const location = locationInput === null ? night.location : locationInput.trim();

    if (!location) {
      await interaction.reply({ content: "The location can't be blank.", flags: MessageFlags.Ephemeral });

      return;
    }

    const movie = movieInput === null ? night.movie : movieInput.trim() || null;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const updated = await editMovieNight(client, store, messages, night, {
        startsAt,
        location,
        movie,
        votingOpen: movieInput === null ? night.votingOpen : movie === null,
        durationMinutes: durationInput ?? night.durationMinutes ?? 180,
        attendanceLimit: attendanceInput ?? night.attendanceLimit,
      });

      await interaction.editReply(`Updated the movie night for <t:${updated.startsAt}:F>.`);
    } catch (error) {
      logger.error("Could not edit movie night", { error, nightId: night.id, userId: interaction.user.id });
      await interaction.editReply("I couldn't update the movie night. Check my event and channel permissions.");
    }
  };
}
