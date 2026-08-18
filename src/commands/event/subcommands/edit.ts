import { MessageFlags } from "discord.js";
import { isOrganizerOrModerator } from "../../../authorization.js";
import { logger } from "../../../logger.js";
import { parseEventLink } from "../actions/create.js";
import { editCommunityEvent } from "../actions/edit.js";
import { parseScheduledEventReference } from "../actions/import.js";
import { editEventSchedule, formatEventSchedule, scheduleEndsAt, scheduleStartsAt } from "../schedule.js";
import { isEventClosed } from "../status.js";
import type { SubcommandSchema } from "../../command-schema.js";
import type { CommandContext, GuildCommandInteraction } from "../../types.js";
import type { EventMessageService } from "../messages.js";

export const editEventSchema: SubcommandSchema = {
  name: "edit",
  description: "Edit a managed event",
  options: [
    {
      type: "string",
      name: "event-id",
      description: "Bot event ID, Discord event ID, or event link",
      maxLength: 300,
      required: true,
    },
    { type: "string", name: "name", description: "New event name", maxLength: 100 },
    { type: "string", name: "starts", description: "New start date/time or first all-day date", maxLength: 100 },
    { type: "string", name: "description", description: "New details; blank clears them", maxLength: 1000 },
    { type: "string", name: "link", description: "New URL; blank clears it", maxLength: 512 },
    { type: "string", name: "ends", description: "New end date/time or last inclusive all-day date", maxLength: 100 },
    { type: "boolean", name: "full-day", description: "Override automatic all-day detection" },
    { type: "integer", name: "duration", description: "Duration in minutes", minValue: 15, maxValue: 10080 },
    {
      type: "integer",
      name: "attendance-limit",
      description: "Maximum Going RSVPs",
      minValue: 1,
      maxValue: 100000,
    },
  ],
};

export function editEventHandler({ client, store, config }: CommandContext, messages: EventMessageService) {
  return async (interaction: GuildCommandInteraction): Promise<void> => {
    const reference = interaction.options.getString("event-id", true).trim();
    let event = store.getEvent(reference.replace(/^event:/, ""));

    if (!event) {
      try {
        const scheduledId = parseScheduledEventReference(reference, interaction.guildId);

        event = store
          .listEvents()
          .find((candidate) => candidate.guildId === interaction.guildId && candidate.scheduledEventId === scheduledId);
      } catch {
        // The reference may be a short bot event ID rather than a Discord event reference.
      }
    }

    if (!event || event.guildId !== interaction.guildId) {
      await interaction.reply({ content: "I couldn't find that managed event.", flags: MessageFlags.Ephemeral });

      return;
    }

    if (isEventClosed(event)) {
      await interaction.reply({
        content: "This event has ended and is no longer editable.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    if (!(await isOrganizerOrModerator(interaction.guild, interaction.user.id, event.creatorId, config.roles))) {
      await interaction.reply({
        content: "Only the event organizer or a moderator can edit it.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const nameInput = interaction.options.getString("name");
    const startsInput = interaction.options.getString("starts");
    const descriptionInput = interaction.options.getString("description");
    const linkInput = interaction.options.getString("link");
    const durationInput = interaction.options.getInteger("duration");
    const attendanceInput = interaction.options.getInteger("attendance-limit");
    const endsInput = interaction.options.getString("ends");
    const fullDayInput = interaction.options.getBoolean("full-day");

    if (
      [
        nameInput,
        startsInput,
        descriptionInput,
        linkInput,
        durationInput,
        attendanceInput,
        endsInput,
        fullDayInput,
      ].every((value) => value === null)
    ) {
      await interaction.reply({ content: "Provide at least one field to edit.", flags: MessageFlags.Ephemeral });

      return;
    }

    const name = nameInput === null ? event.name : nameInput.trim();

    if (!name) {
      await interaction.reply({ content: "The event name can't be blank.", flags: MessageFlags.Ephemeral });

      return;
    }

    let schedule;

    try {
      schedule = editEventSchedule(
        event.schedule,
        {
          starts: startsInput ?? undefined,
          ends: endsInput ?? undefined,
          fullDay: fullDayInput ?? undefined,
          durationMinutes: durationInput ?? undefined,
        },
        config.timeZone,
      );
    } catch (error) {
      await interaction.reply({ content: (error as Error).message, flags: MessageFlags.Ephemeral });

      return;
    }

    const now = Math.floor(Date.now() / 1000);

    if (
      scheduleEndsAt(schedule) <= now ||
      (startsInput !== null && schedule.type === "timed" && scheduleStartsAt(schedule) <= now)
    ) {
      await interaction.reply({
        content: "Provide an event schedule that has not ended.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    let link = event.link;

    try {
      if (linkInput !== null) link = parseEventLink(linkInput);
    } catch {
      await interaction.reply({
        content: "The event link must be a valid `http://` or `https://` URL.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const updated = await editCommunityEvent(client, store, messages, event, {
        name,
        schedule,
        description: descriptionInput === null ? event.description : descriptionInput.trim() || undefined,
        link,
        attendanceLimit: attendanceInput ?? event.attendanceLimit,
      });

      await interaction.editReply(`Updated **${updated.name}** for ${formatEventSchedule(updated.schedule)}.`);
    } catch (error) {
      logger.error("Could not edit event", { error, eventId: event.id, userId: interaction.user.id });
      await interaction.editReply("I couldn't update the event. Check my event and channel permissions.");
    }
  };
}
