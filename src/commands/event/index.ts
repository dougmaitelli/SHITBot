import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  GuildScheduledEventStatus,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
} from "discord.js";
import { logger } from "../../logger.js";
import { setRsvp, type RsvpStatus } from "../../shared/rsvp.js";
import { parseDate } from "../../utils/date-parser.js";
import { registerEventAssistantTools } from "./assistant-tools.js";
import {
  adoptCommunityEvent,
  createCommunityEvent,
  parseEventLink,
  parseScheduledEventReference,
} from "./create-event.js";
import { renderEvent } from "./event-render.js";
import { startExpirationJob } from "./expiration-job.js";
import { deleteScheduledEvent } from "./scheduled-event.js";
import type { CommandFactory, CommandModule } from "../types.js";
import type { CommunityEvent } from "./types.js";

const actions = new Set(["eventRsvp", "eventDelete"]);
const isClosed = (event: CommunityEvent) => Boolean(event.closedAt) || event.startsAt <= Math.floor(Date.now() / 1000);

const createEventCommand: CommandFactory = ({ client, store, config, assistantTools }): CommandModule => {
  registerEventAssistantTools(client, store, assistantTools, config.timeZone, config.movieNightsChannel);
  async function updateMessage(event: CommunityEvent): Promise<void> {
    const channel = await client.channels.fetch(event.channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    const message = await channel.messages.fetch(event.messageId);
    await message.edit(renderEvent(event));
  }

  async function create(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild() || !interaction.channelId) {
      await interaction.reply({
        content: "Events can only be created in a server channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
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
      await interaction.reply({ content: "The event must be scheduled in the future.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const channel = interaction.channel;
      if (!channel?.isTextBased() || !channel.isSendable()) throw new Error("Event channel is not sendable");
      const event = await createCommunityEvent(
        client,
        store,
        {
          guild: interaction.guild,
          channelId: interaction.channelId,
          creatorId: interaction.user.id,
          name,
          startsAt,
          description: interaction.options.getString("description")?.trim() || undefined,
          link,
          attendanceLimit: interaction.options.getInteger("attendance-limit") ?? undefined,
          durationMinutes: interaction.options.getInteger("duration") ?? 180,
        },
        (options) => channel.send(options),
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
  }

  async function importEvent(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild() || !interaction.channelId) {
      await interaction.reply({
        content: "Events can only be imported in a server channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
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
      const channel = interaction.channel;
      if (!channel?.isTextBased() || !channel.isSendable()) {
        await interaction.editReply("I can't post a managed event in this channel.");
        return;
      }
      const event = await adoptCommunityEvent(
        store,
        {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          creatorId: interaction.user.id,
          attendanceLimit: interaction.options.getInteger("attendance-limit") ?? undefined,
        },
        scheduledEvent,
        (options) => channel.send(options),
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
  }

  async function rsvp(interaction: ButtonInteraction, event: CommunityEvent, status: RsvpStatus): Promise<void> {
    if (!setRsvp(event.rsvps, interaction.user.id, status, event.attendanceLimit)) {
      await interaction.reply({
        content: "This event has reached its attendance limit.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await store.setEvent(event);
    await interaction.update(renderEvent(event));
  }

  async function remove(interaction: ButtonInteraction, event: CommunityEvent): Promise<void> {
    if (interaction.user.id !== event.creatorId) {
      await interaction.reply({ content: "Only the event organizer can delete it.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferUpdate();
    await deleteScheduledEvent(client, event).catch((error) =>
      logger.error("Could not delete scheduled event", { error, scheduledEventId: event.scheduledEventId }),
    );
    await store.deleteEvent(event.id);
    await interaction.message.delete().catch((error: unknown) => {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === 10008)) throw error;
    });
  }

  async function handleInteraction(interaction: Interaction): Promise<boolean> {
    if (!interaction.isButton()) return false;
    const [action, eventId, value] = interaction.customId.split(":");
    if (!action || !actions.has(action)) return false;
    const event = eventId ? store.getEvent(eventId) : undefined;
    if (!event) {
      await interaction.reply({
        content: "I couldn't find that event. It may have been removed.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (isClosed(event) && action !== "eventDelete") {
      if (!event.closedAt) {
        event.closedAt = Date.now();
        await store.setEvent(event);
        await updateMessage(event).catch(() => undefined);
      }
      await interaction.reply({
        content: "This event has started and is no longer editable.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (action === "eventRsvp" && (value === "yes" || value === "maybe" || value === "no"))
      await rsvp(interaction, event, value);
    else if (action === "eventDelete") await remove(interaction, event);
    return true;
  }

  return {
    data: new SlashCommandBuilder()
      .setName("event")
      .setDescription("Organize an event")
      .addSubcommand((command) =>
        command
          .setName("create")
          .setDescription("Create a new event")
          .addStringOption((option) =>
            option.setName("name").setDescription("Event name").setMaxLength(100).setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("when")
              .setDescription("Date and time, e.g. 2026-08-15 7:30 PM")
              .setMaxLength(100)
              .setRequired(true),
          )
          .addStringOption((option) =>
            option.setName("description").setDescription("Optional event details").setMaxLength(1000),
          )
          .addStringOption((option) => option.setName("link").setDescription("Optional event URL").setMaxLength(512))
          .addIntegerOption((option) =>
            option
              .setName("duration")
              .setDescription("Duration in minutes (default: 180)")
              .setMinValue(15)
              .setMaxValue(10080),
          )
          .addIntegerOption((option) =>
            option
              .setName("attendance-limit")
              .setDescription("Maximum number of people who can RSVP Going")
              .setMinValue(1)
              .setMaxValue(100000),
          ),
      )
      .addSubcommand((command) =>
        command
          .setName("import")
          .setDescription("Convert an existing Discord event into a bot-managed event")
          .addStringOption((option) =>
            option
              .setName("discord-event")
              .setDescription("Discord event ID or copied event link")
              .setMaxLength(300)
              .setRequired(true),
          )
          .addIntegerOption((option) =>
            option
              .setName("attendance-limit")
              .setDescription("Maximum number of people who can RSVP Going")
              .setMinValue(1)
              .setMaxValue(100000),
          ),
      )
      .toJSON(),
    async execute(interaction) {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "create") await create(interaction);
      else if (subcommand === "import") await importEvent(interaction);
    },
    handleInteraction,
    onReady() {
      startExpirationJob(store, updateMessage);
    },
  };
};

export default createEventCommand;
