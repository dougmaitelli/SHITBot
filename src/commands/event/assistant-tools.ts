import type { Client } from "discord.js";
import { attendance, findUpcomingItem, upcomingItems } from "../../assistant/event-data.js";
import { createReminder, parseReminderArguments } from "../../assistant/reminder-tool.js";
import { itemSummary, objectArguments, requestedLimit } from "../../assistant/tool-utils.js";
import type { AssistantTool } from "../../assistant/types.js";
import type { BotStore } from "../../store.js";

export function registerEventAssistantTools(client: Client, store: BotStore, tools: AssistantTool[], timeZone: string): void {
  const events = (guildId: string) => upcomingItems(store, guildId).filter((item) => item.kind === "event");

  tools.push({
    name: "list_upcoming_events",
    description: "List upcoming general events in this Discord server, ordered by date. This does not include movie nights.",
    parameters: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: 25, description: "Defaults to 10" } } },
    async execute(context, value) {
      const input = objectArguments(value);
      const items = events(context.guild.id).slice(0, requestedLimit(input.limit));
      return JSON.stringify({ events: items.map((item) => itemSummary(item)), total_returned: items.length });
    },
  });

  tools.push({
    name: "list_my_upcoming_events",
    description: "List upcoming general events where the requesting user RSVP'd Going. Can optionally include Maybe responses. This does not include movie nights.",
    parameters: { type: "object", additionalProperties: false, properties: {
      include_maybe: { type: "boolean", description: "Defaults to false" },
      limit: { type: "integer", minimum: 1, maximum: 25, description: "Defaults to 10" },
    } },
    async execute(context, value) {
      const input = objectArguments(value);
      if (input.include_maybe !== undefined && typeof input.include_maybe !== "boolean") throw new Error("include_maybe must be true or false.");
      const accepted = input.include_maybe ? new Set(["yes", "maybe"]) : new Set(["yes"]);
      const items = events(context.guild.id).filter((item) => accepted.has(item.rsvps[context.userId] ?? "")).slice(0, requestedLimit(input.limit));
      return JSON.stringify({ events: items.map((item) => itemSummary(item, context.userId)), total_returned: items.length });
    },
  });

  tools.push({
    name: "get_event_attendance",
    description: "Get attendance and remaining availability for one upcoming general event. Obtain its ID from list_upcoming_events first.",
    parameters: { type: "object", additionalProperties: false, required: ["event_id"], properties: { event_id: { type: "string", description: "Stable ID such as event:abcd1234" } } },
    async execute(context, value) {
      const input = objectArguments(value);
      if (typeof input.event_id !== "string") throw new Error("event_id is required.");
      const item = findUpcomingItem(store, context.guild.id, input.event_id);
      if (!item || item.kind !== "event") throw new Error("That upcoming event could not be found.");
      return JSON.stringify({ event: itemSummary(item), attendance: attendance(item) });
    },
  });

  tools.push({
    name: "create_event_reminder",
    description: "Post or schedule an organizer-only reminder for an upcoming general event. Obtain its ID from list_upcoming_events first. Omit when to post now.",
    parameters: { type: "object", additionalProperties: false, required: ["event_id"], properties: {
      event_id: { type: "string", description: "Stable general-event ID" },
      when: { type: "string", description: `Optional future date/time; defaults to ${timeZone} without an offset` },
      message: { type: "string", description: "Optional note, maximum 1000 characters" },
    } },
    async execute(context, value) {
      const input = objectArguments(value);
      if (typeof input.event_id !== "string") throw new Error("event_id is required.");
      const item = findUpcomingItem(store, context.guild.id, input.event_id);
      if (!item || item.kind !== "event") throw new Error("That upcoming event could not be found.");
      return createReminder(client, store, context, item, parseReminderArguments(input), timeZone);
    },
  });
}
