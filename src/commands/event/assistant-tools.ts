import { GuildScheduledEventStatus, type Client, type Guild, type GuildScheduledEvent } from "discord.js";
import { attendance, upcomingItems, type UpcomingItem } from "../../assistant/event-data.js";
import { createReminder, parseReminderArguments } from "../../assistant/reminder-tool.js";
import { itemSummary, objectArguments, requestedLimit } from "../../assistant/tool-utils.js";
import { parseDate } from "../../utils/date-parser.js";
import { isMovieNightChannel } from "../movie-night/channel-policy.js";
import { createCommunityEvent, parseEventLink } from "./create-event.js";
import type { AssistantTool, AssistantToolContext } from "../../assistant/types.js";
import type { BotStore } from "../../store.js";

interface DiscordItem {
  item: UpcomingItem;
  scheduled: GuildScheduledEvent;
}
interface EventToolArguments {
  name: string;
  when: string;
  description?: string;
  link?: string;
  duration_minutes?: number;
  attendance_limit?: number;
}

function creationArguments(value: unknown): EventToolArguments {
  const input = objectArguments(value);
  if (typeof input.name !== "string" || !input.name.trim()) throw new Error("An event name is required.");
  if (typeof input.when !== "string" || !input.when.trim()) throw new Error("An event date and time are required.");
  if (input.description !== undefined && typeof input.description !== "string")
    throw new Error("Description must be text.");
  if (input.link !== undefined && typeof input.link !== "string") throw new Error("Link must be text.");
  if (
    input.duration_minutes !== undefined &&
    (!Number.isInteger(input.duration_minutes) ||
      (input.duration_minutes as number) < 15 ||
      (input.duration_minutes as number) > 10080)
  )
    throw new Error("Duration must be from 15 to 10080 minutes.");
  if (
    input.attendance_limit !== undefined &&
    (!Number.isInteger(input.attendance_limit) ||
      (input.attendance_limit as number) < 1 ||
      (input.attendance_limit as number) > 100000)
  )
    throw new Error("Attendance limit must be from 1 to 100000.");
  return input as unknown as EventToolArguments;
}

async function discordItems(guild: Guild, store: BotStore): Promise<DiscordItem[]> {
  const scheduled = await guild.scheduledEvents.fetch({ withUserCount: true });
  const localItems = upcomingItems(store, guild.id);
  const localByScheduledId = new Map<string, UpcomingItem>();
  for (const item of localItems) {
    const id =
      item.kind === "event"
        ? store.getEvent(item.ref.slice("event:".length))?.scheduledEventId
        : store.get(item.ref.slice("movie-night:".length))?.scheduledEventId;
    if (id) localByScheduledId.set(id, item);
  }

  return [...scheduled.values()]
    .filter(
      (event) =>
        (event.status === GuildScheduledEventStatus.Scheduled || event.status === GuildScheduledEventStatus.Active) &&
        event.scheduledStartTimestamp !== null,
    )
    .map((event) => {
      const local = localByScheduledId.get(event.id);
      const item: UpcomingItem = local
        ? { ...local, url: event.url, discordInterestedCount: event.userCount ?? undefined }
        : {
            ref: `discord-event:${event.id}`,
            kind: "event",
            guildId: guild.id,
            channelId: event.channelId ?? "",
            messageId: "",
            creatorId: event.creatorId ?? "",
            title: event.name,
            startsAt: Math.floor(event.scheduledStartTimestamp! / 1000),
            details: [event.description, event.entityMetadata?.location].filter(Boolean).join("\n") || undefined,
            rsvps: {},
            url: event.url,
            discordInterestedCount: event.userCount ?? undefined,
          };
      return { item, scheduled: event };
    })
    .sort((left, right) => left.item.startsAt - right.item.startsAt);
}

async function isInterested(event: GuildScheduledEvent, userId: string): Promise<boolean> {
  const after = (BigInt(userId) - 1n).toString();
  const subscribers = await event.fetchSubscribers({ after, limit: 1 });
  return subscribers.has(userId);
}

export function registerEventAssistantTools(
  client: Client,
  store: BotStore,
  tools: AssistantTool[],
  timeZone: string,
  movieNightsChannel: string,
): void {
  async function visible(context: AssistantToolContext): Promise<DiscordItem[]> {
    const channel = await client.channels.fetch(context.channelId);
    const inMovieChannel = Boolean(
      channel?.isTextBased() && !channel.isDMBased() && isMovieNightChannel(channel.name, movieNightsChannel),
    );
    const items = await discordItems(context.guild, store);
    return inMovieChannel ? items : items.filter(({ item }) => item.kind !== "movie-night");
  }

  tools.push({
    name: "create_event",
    description: "Create a non-movie event in the current Discord channel. Use only when explicitly requested.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["name", "when"],
      properties: {
        name: { type: "string", description: "Event name, maximum 100 characters" },
        when: { type: "string", description: `Date and time; defaults to ${timeZone} when no offset is given` },
        description: { type: "string", description: "Optional details, maximum 1000 characters" },
        link: { type: "string", description: "Optional http or https URL" },
        duration_minutes: { type: "integer", minimum: 15, maximum: 10080, description: "Defaults to 180" },
        attendance_limit: { type: "integer", minimum: 1, maximum: 100000 },
      },
    },
    async execute(context, value) {
      const input = creationArguments(value);
      const startsAt = parseDate(input.when, timeZone);
      if (!startsAt) throw new Error("I couldn't understand the event date and time.");
      if (startsAt <= Math.floor(Date.now() / 1000)) throw new Error("The event must be scheduled in the future.");
      const name = input.name.trim();
      if (name.length > 100) throw new Error("The event name must be at most 100 characters.");
      const description = input.description?.trim() || undefined;
      if (description && description.length > 1000) throw new Error("The description must be at most 1000 characters.");
      let link: string | undefined;
      try {
        link = parseEventLink(input.link);
      } catch {
        throw new Error("The event link must be a valid http or https URL.");
      }
      const channel = await client.channels.fetch(context.channelId);
      if (!channel?.isTextBased() || !channel.isSendable()) throw new Error("I can't send an event in this channel.");
      const event = await createCommunityEvent(
        client,
        store,
        {
          guild: context.guild,
          channelId: context.channelId,
          creatorId: context.userId,
          name,
          startsAt,
          description,
          link,
          attendanceLimit: input.attendance_limit,
          durationMinutes: input.duration_minutes ?? 180,
        },
        (options) => channel.send(options),
      );
      return `Created **${event.name}** for <t:${event.startsAt}:F> in <#${event.channelId}>.`;
    },
  });

  tools.push({
    name: "list_upcoming_events",
    description:
      "List all upcoming Discord Scheduled Events in this server, including events created manually or by other bots.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { limit: { type: "integer", minimum: 1, maximum: 25, description: "Defaults to 10" } },
    },
    async execute(context, value) {
      const input = objectArguments(value);
      const items = (await visible(context)).slice(0, requestedLimit(input.limit));
      return JSON.stringify({ events: items.map(({ item }) => itemSummary(item)), total_returned: items.length });
    },
  });

  tools.push({
    name: "list_my_upcoming_events",
    description:
      "List upcoming Discord Scheduled Events the requesting user marked Interested in, plus bot events where they RSVP'd Going. Can include bot Maybe responses.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        include_maybe: { type: "boolean", description: "Include bot-managed Maybe RSVPs; defaults to false" },
        limit: { type: "integer", minimum: 1, maximum: 25, description: "Defaults to 10" },
      },
    },
    async execute(context, value) {
      const input = objectArguments(value);
      if (input.include_maybe !== undefined && typeof input.include_maybe !== "boolean")
        throw new Error("include_maybe must be true or false.");
      const accepted = input.include_maybe ? new Set(["yes", "maybe"]) : new Set(["yes"]);
      const matches: UpcomingItem[] = [];
      for (const { item, scheduled } of await visible(context)) {
        if (accepted.has(item.rsvps[context.userId] ?? "") || (await isInterested(scheduled, context.userId)))
          matches.push(item);
        if (matches.length >= requestedLimit(input.limit)) break;
      }
      return JSON.stringify({
        events: matches.map((item) => itemSummary(item, context.userId)),
        total_returned: matches.length,
      });
    },
  });

  tools.push({
    name: "get_event_attendance",
    description:
      "Get attendance for one Discord Scheduled Event. Bot-created events include RSVP breakdowns; other events include Discord's Interested count.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["event_id"],
      properties: { event_id: { type: "string", description: "Stable ID returned by list_upcoming_events" } },
    },
    async execute(context, value) {
      const input = objectArguments(value);
      if (typeof input.event_id !== "string") throw new Error("event_id is required.");
      const found = (await visible(context)).find(({ item }) => item.ref === input.event_id);
      if (!found) throw new Error("That upcoming Discord event could not be found.");
      return JSON.stringify({ event: itemSummary(found.item), attendance: attendance(found.item) });
    },
  });

  tools.push({
    name: "create_event_reminder",
    description:
      "Post or schedule an organizer-only reminder for an upcoming Discord Scheduled Event. Omit when to post now.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["event_id"],
      properties: {
        event_id: { type: "string", description: "Stable ID returned by list_upcoming_events" },
        when: { type: "string", description: `Optional future date/time; defaults to ${timeZone} without an offset` },
        message: { type: "string", description: "Optional note, maximum 1000 characters" },
      },
    },
    async execute(context, value) {
      const input = objectArguments(value);
      if (typeof input.event_id !== "string") throw new Error("event_id is required.");
      const found = (await visible(context)).find(({ item }) => item.ref === input.event_id);
      if (!found) throw new Error("That upcoming Discord event could not be found.");
      return createReminder(client, store, context, found.item, parseReminderArguments(input), timeZone);
    },
  });
}
