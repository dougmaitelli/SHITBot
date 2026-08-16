import { MessageFlags, SlashCommandBuilder, type ButtonInteraction, type ChatInputCommandInteraction, type Interaction } from "discord.js";
import { parseDate } from "../../utils/date-parser.js";
import { setRsvp, type RsvpStatus } from "../../shared/rsvp.js";
import type { CommandFactory, CommandModule } from "../types.js";
import { renderEvent } from "./event-render.js";
import { startExpirationJob } from "./expiration-job.js";
import { deleteScheduledEvent } from "./scheduled-event.js";
import type { CommunityEvent } from "./types.js";
import { createCommunityEvent } from "./create-event.js";

const actions = new Set(["eventRsvp", "eventDelete"]);
const isClosed = (event: CommunityEvent) => Boolean(event.closedAt) || event.startsAt <= Math.floor(Date.now() / 1000);

interface EventToolArguments {
  name: string; when: string; description?: string; link?: string;
  duration_minutes?: number; attendance_limit?: number;
}

function parseToolArguments(value: unknown): EventToolArguments {
  if (!value || typeof value !== "object") throw new Error("Event details must be an object.");
  const input = value as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim()) throw new Error("An event name is required.");
  if (typeof input.when !== "string" || !input.when.trim()) throw new Error("An event date and time are required.");
  if (input.description !== undefined && typeof input.description !== "string") throw new Error("Description must be text.");
  if (input.link !== undefined && typeof input.link !== "string") throw new Error("Link must be text.");
  const duration = input.duration_minutes;
  if (duration !== undefined && (!Number.isInteger(duration) || (duration as number) < 15 || (duration as number) > 10080)) throw new Error("Duration must be from 15 to 10080 minutes.");
  const limit = input.attendance_limit;
  if (limit !== undefined && (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 100000)) throw new Error("Attendance limit must be from 1 to 100000.");
  return input as unknown as EventToolArguments;
}

function parseLink(value: string | undefined): string | undefined {
  const link = value?.trim() || undefined;
  if (!link) return undefined;
  const url = new URL(link);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported URL protocol");
  return link;
}

const createEventCommand: CommandFactory = ({ client, store, config, assistantTools }): CommandModule => {
  async function updateMessage(event: CommunityEvent): Promise<void> {
    const channel = await client.channels.fetch(event.channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    const message = await channel.messages.fetch(event.messageId);
    await message.edit(renderEvent(event));
  }

  async function create(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild() || !interaction.channelId) {
      await interaction.reply({ content: "Events can only be created in a server channel.", flags: MessageFlags.Ephemeral });
      return;
    }
    const name = interaction.options.getString("name", true).trim();
    if (!name) {
      await interaction.reply({ content: "The event name can't be blank.", flags: MessageFlags.Ephemeral });
      return;
    }
    let link: string | undefined;
    try { link = parseLink(interaction.options.getString("link") ?? undefined); }
    catch {
      await interaction.reply({ content: "The event link must be a valid `http://` or `https://` URL.", flags: MessageFlags.Ephemeral });
      return;
    }
    const startsAt = parseDate(interaction.options.getString("when", true), config.timeZone);
    if (!startsAt) {
      await interaction.reply({ content: "I couldn't understand that date and time. Try `2 october 7pm`, `08/15/2026 19:30`, or `2026-08-15 19:30-07:00`.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (startsAt <= Math.floor(Date.now() / 1000)) {
      await interaction.reply({ content: "The event must be scheduled in the future.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply();
    try {
      await createCommunityEvent(client, store, {
        guild: interaction.guild, channelId: interaction.channelId, creatorId: interaction.user.id, name, startsAt,
        description: interaction.options.getString("description")?.trim() || undefined, link,
        attendanceLimit: interaction.options.getInteger("attendance-limit") ?? undefined,
        durationMinutes: interaction.options.getInteger("duration") ?? 180,
      }, (options) => interaction.editReply(options));
    } catch (error) {
      console.error("Could not create event", error);
      await interaction.deleteReply().catch(() => undefined);
      await interaction.followUp({ content: "I couldn't create the event. Check my channel and **Create Events** permissions.", flags: MessageFlags.Ephemeral });
    }
  }

  assistantTools.push({
    name: "create_event",
    description: "Create a non-movie event in the current Discord channel. Use only when explicitly requested.",
    parameters: {
      type: "object", additionalProperties: false, required: ["name", "when"],
      properties: {
        name: { type: "string", description: "Event name, maximum 100 characters" },
        when: { type: "string", description: `Date and time; defaults to ${config.timeZone} when no offset is given` },
        description: { type: "string", description: "Optional details, maximum 1000 characters" },
        link: { type: "string", description: "Optional http or https URL" },
        duration_minutes: { type: "integer", minimum: 15, maximum: 10080, description: "Defaults to 180" },
        attendance_limit: { type: "integer", minimum: 1, maximum: 100000 },
      },
    },
    async execute(context, value) {
      const input = parseToolArguments(value);
      const startsAt = parseDate(input.when, config.timeZone);
      if (!startsAt) throw new Error("I couldn't understand the event date and time.");
      if (startsAt <= Math.floor(Date.now() / 1000)) throw new Error("The event must be scheduled in the future.");
      const name = input.name.trim();
      if (name.length > 100) throw new Error("The event name must be at most 100 characters.");
      const description = input.description?.trim() || undefined;
      if (description && description.length > 1000) throw new Error("The description must be at most 1000 characters.");
      let link: string | undefined;
      try { link = parseLink(input.link); } catch { throw new Error("The event link must be a valid http or https URL."); }
      const channel = await client.channels.fetch(context.channelId);
      if (!channel?.isTextBased() || !channel.isSendable()) throw new Error("I can't send an event in this channel.");
      const event = await createCommunityEvent(client, store, {
        guild: context.guild, channelId: context.channelId, creatorId: context.userId, name, startsAt,
        description, link, attendanceLimit: input.attendance_limit, durationMinutes: input.duration_minutes ?? 180,
      }, (options) => channel.send(options));
      return `Created **${event.name}** for <t:${event.startsAt}:F> in <#${event.channelId}>.`;
    },
  });

  async function rsvp(interaction: ButtonInteraction, event: CommunityEvent, status: RsvpStatus): Promise<void> {
    if (!setRsvp(event.rsvps, interaction.user.id, status, event.attendanceLimit)) {
      await interaction.reply({ content: "This event has reached its attendance limit.", flags: MessageFlags.Ephemeral });
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
    await deleteScheduledEvent(client, event).catch((error) => console.error(`Could not delete scheduled event ${event.scheduledEventId}`, error));
    await store.deleteEvent(event.id);
    await interaction.message.delete();
  }

  async function handleInteraction(interaction: Interaction): Promise<boolean> {
    if (!interaction.isButton()) return false;
    const [action, eventId, value] = interaction.customId.split(":");
    if (!action || !actions.has(action)) return false;
    const event = eventId ? store.getEvent(eventId) : undefined;
    if (!event) {
      await interaction.reply({ content: "I couldn't find that event. It may have been removed.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (isClosed(event) && action !== "eventDelete") {
      if (!event.closedAt) { event.closedAt = Date.now(); await store.setEvent(event); await updateMessage(event).catch(() => undefined); }
      await interaction.reply({ content: "This event has started and is no longer editable.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (action === "eventRsvp" && (value === "yes" || value === "maybe" || value === "no")) await rsvp(interaction, event, value);
    else if (action === "eventDelete") await remove(interaction, event);
    return true;
  }

  return {
    data: new SlashCommandBuilder().setName("event").setDescription("Organize an event").addSubcommand((command) => command
      .setName("create").setDescription("Create a new event")
      .addStringOption((option) => option.setName("name").setDescription("Event name").setMaxLength(100).setRequired(true))
      .addStringOption((option) => option.setName("when").setDescription("Date and time, e.g. 2026-08-15 7:30 PM").setMaxLength(100).setRequired(true))
      .addStringOption((option) => option.setName("description").setDescription("Optional event details").setMaxLength(1000))
      .addStringOption((option) => option.setName("link").setDescription("Optional event URL").setMaxLength(512))
      .addIntegerOption((option) => option.setName("duration").setDescription("Duration in minutes (default: 180)").setMinValue(15).setMaxValue(10080))
      .addIntegerOption((option) => option.setName("attendance-limit").setDescription("Maximum number of people who can RSVP Going").setMinValue(1).setMaxValue(100000))).toJSON(),
    async execute(interaction) { if (interaction.options.getSubcommand() === "create") await create(interaction); },
    handleInteraction,
    onReady() { startExpirationJob(store, updateMessage); },
  };
};

export default createEventCommand;
