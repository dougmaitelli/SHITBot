import { GuildScheduledEventStatus, MessageFlags, PermissionFlagsBits } from "discord.js";
import { logger } from "../../../logger.js";
import { adoptCommunityEvent, parseScheduledEventReference } from "../actions/import.js";
import type { SubcommandSchema } from "../../command-schema.js";
import type { CommandContext, GuildCommandInteraction } from "../../types.js";

export const importEventSchema: SubcommandSchema = {
  name: "import",
  description: "Convert an existing Discord event into a bot-managed event",
  options: [
    {
      type: "string",
      name: "discord-event",
      description: "Discord event ID or copied event link",
      maxLength: 300,
      required: true,
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

export function importEventHandler({ store }: CommandContext) {
  return async (interaction: GuildCommandInteraction): Promise<void> => {
    let scheduledEventId: string;

    try {
      scheduledEventId = parseScheduledEventReference(
        interaction.options.getString("discord-event", true),
        interaction.guildId,
      );
    } catch {
      await interaction.reply({
        content: "Provide a valid Discord scheduled-event ID or copied event link from this server.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    if (
      store
        .listEvents()
        .some((event) => event.guildId === interaction.guildId && event.scheduledEventId === scheduledEventId) ||
      store.list().some((night) => night.guildId === interaction.guildId && night.scheduledEventId === scheduledEventId)
    ) {
      await interaction.reply({
        content: "That Discord event is already managed by the bot.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    await interaction.deferReply();
    try {
      const scheduledEvent = await interaction.guild.scheduledEvents.fetch(scheduledEventId);

      if (
        scheduledEvent.status !== GuildScheduledEventStatus.Scheduled ||
        !scheduledEvent.scheduledStartTimestamp ||
        scheduledEvent.scheduledStartTimestamp <= Date.now()
      ) {
        await interaction.editReply("Only a future scheduled Discord event can be imported.");

        return;
      }

      if (
        scheduledEvent.creatorId !== interaction.user.id &&
        !interaction.memberPermissions.has(PermissionFlagsBits.ManageEvents)
      ) {
        await interaction.editReply("Only the Discord event creator or someone with Manage Events can import it.");

        return;
      }

      const event = await adoptCommunityEvent(
        store,
        {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          importedById: interaction.user.id,
          attendanceLimit: interaction.options.getInteger("attendance-limit") ?? undefined,
        },
        scheduledEvent,
        (options) => interaction.channel.send(options),
      );

      await interaction.editReply(
        `Imported **${event.name}**. [View the managed event](https://discord.com/channels/${event.guildId}/${event.channelId}/${event.messageId}).`,
      );
    } catch (error) {
      logger.error("Could not import Discord event", {
        error,
        scheduledEventId,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
      });
      await interaction.editReply(
        "I couldn't import that Discord event. Check that it still exists and I can post in this channel.",
      );
    }
  };
}
