import { MessageFlags } from "discord.js";
import { logger } from "../../../logger.js";
import { createCommunityEvent, parseEventLink } from "../actions/create.js";
import { createEventSchedule, scheduleEndsAt, scheduleStartsAt } from "../schedule.js";
import type { SubcommandSchema } from "../../command-schema.js";
import type { CommandContext, GuildCommandInteraction } from "../../types.js";

export const createEventSchema: SubcommandSchema = {
  name: "create",
  description: "Create a new event",
  options: [
    { type: "string", name: "name", description: "Event name", maxLength: 100, required: true },
    {
      type: "string",
      name: "starts",
      description: "Start date/time, or first date for an all-day event",
      maxLength: 100,
      required: true,
    },
    { type: "string", name: "description", description: "Optional event details", maxLength: 1000 },
    { type: "string", name: "link", description: "Optional event URL", maxLength: 512 },
    { type: "string", name: "ends", description: "End date/time, or last inclusive all-day date", maxLength: 100 },
    { type: "boolean", name: "full-day", description: "Override automatic all-day detection" },
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
    const endsInput = interaction.options.getString("ends");
    const durationInput = interaction.options.getInteger("duration");
    let schedule;

    try {
      schedule = createEventSchedule(
        {
          starts: interaction.options.getString("starts", true),
          ends: endsInput ?? undefined,
          fullDay: interaction.options.getBoolean("full-day") ?? undefined,
          durationMinutes: durationInput ?? undefined,
        },
        config.timeZone,
      );
    } catch (error) {
      await interaction.reply({ content: (error as Error).message, flags: MessageFlags.Ephemeral });

      return;
    }

    const now = Math.floor(Date.now() / 1000);

    if (scheduleEndsAt(schedule) <= now || (schedule.type === "timed" && scheduleStartsAt(schedule) <= now)) {
      await interaction.reply({ content: "The event must be scheduled in the future.", flags: MessageFlags.Ephemeral });

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
          schedule,
          description: interaction.options.getString("description")?.trim() || undefined,
          link,
          attendanceLimit: interaction.options.getInteger("attendance-limit") ?? undefined,
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
