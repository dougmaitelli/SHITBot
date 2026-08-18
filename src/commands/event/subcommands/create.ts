import { MessageFlags } from "discord.js";
import { logger } from "../../../logger.js";
import { addZonedDays, parseDate, parseDateOnly, parseEventEnd } from "../../../utils/date-parser.js";
import { createCommunityEvent, parseEventLink } from "../actions/create.js";
import type { SubcommandSchema } from "../../command-schema.js";
import type { CommandContext, GuildCommandInteraction } from "../../types.js";

export const createEventSchema: SubcommandSchema = {
  name: "create",
  description: "Create a new event",
  options: [
    { type: "string", name: "name", description: "Event name", maxLength: 100, required: true },
    {
      type: "string",
      name: "when",
      description: "Date and time, e.g. 2026-08-15 7:30 PM",
      maxLength: 100,
      required: true,
    },
    { type: "string", name: "description", description: "Optional event details", maxLength: 1000 },
    { type: "string", name: "link", description: "Optional event URL", maxLength: 512 },
    { type: "string", name: "ends", description: "Optional end date/time", maxLength: 100 },
    { type: "boolean", name: "full-day", description: "Treat this as an all-day event" },
    {
      type: "integer",
      name: "duration",
      description: "Duration in minutes (default: 180)",
      minValue: 15,
      maxValue: 10080,
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

export function createEventHandler({ client, store, config }: CommandContext) {
  return async (interaction: GuildCommandInteraction): Promise<void> => {
    const name = interaction.options.getString("name", true).trim();

    if (!name) {
      await interaction.reply({ content: "The event name can't be blank.", flags: MessageFlags.Ephemeral });

      return;
    }

    let link: string | undefined;

    try {
      link = parseEventLink(interaction.options.getString("link") ?? undefined);
    } catch {
      await interaction.reply({
        content: "The event link must be a valid `http://` or `https://` URL.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }
    const fullDay = interaction.options.getBoolean("full-day") ?? false;
    const startsAt = (fullDay ? parseDateOnly : parseDate)(
      interaction.options.getString("when", true),
      config.timeZone,
    );

    if (!startsAt) {
      await interaction.reply({
        content:
          "I couldn't understand that date and time. Try `2 october 7pm`, `08/15/2026 19:30`, or `2026-08-15 19:30-07:00`.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    if (startsAt <= Math.floor(Date.now() / 1000)) {
      await interaction.reply({ content: "The event must be scheduled in the future.", flags: MessageFlags.Ephemeral });

      return;
    }

    const endsInput = interaction.options.getString("ends");
    const durationInput = interaction.options.getInteger("duration");

    if (endsInput !== null && durationInput !== null) {
      await interaction.reply({
        content: "Use either an end date/time or a duration, not both.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const endsAt =
      (endsInput
        ? parseEventEnd(endsInput, config.timeZone, startsAt, fullDay)
        : fullDay
          ? addZonedDays(startsAt, config.timeZone, 1)
          : undefined) ?? undefined;

    if (endsInput !== null && (!endsAt || endsAt <= startsAt)) {
      await interaction.reply({
        content: "The event end must be a valid date/time after its start.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const event = await createCommunityEvent(
        client,
        store,
        {
          guild: interaction.guild,
          channelId: interaction.channelId,
          creatorId: interaction.user.id,
          name,
          startsAt,
          endsAt,
          fullDay,
          description: interaction.options.getString("description")?.trim() || undefined,
          link,
          attendanceLimit: interaction.options.getInteger("attendance-limit") ?? undefined,
          durationMinutes: durationInput ?? 180,
        },
        (options) => interaction.channel.send(options),
      );

      await interaction.editReply(
        `Created **${event.name}**. [View the event](https://discord.com/channels/${event.guildId}/${event.channelId}/${event.messageId}).`,
      );
    } catch (error) {
      logger.error("Could not create event", {
        error,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
      });
      await interaction.deleteReply().catch(() => undefined);
      await interaction.followUp({
        content: "I couldn't create the event. Check my channel and **Create Events** permissions.",
        flags: MessageFlags.Ephemeral,
      });
    }
  };
}
