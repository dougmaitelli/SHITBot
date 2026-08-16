import type { Client } from "discord.js";
import { attendance, findUpcomingItem, upcomingItems } from "../../assistant/event-data.js";
import { createReminder, parseReminderArguments } from "../../assistant/reminder-tool.js";
import { itemSummary, objectArguments, requestedLimit } from "../../assistant/tool-utils.js";
import type { AssistantTool } from "../../assistant/types.js";
import type { BotStore } from "../../store.js";

export function registerMovieNightAssistantTools(
  client: Client, store: BotStore, tools: AssistantTool[], timeZone: string,
  requireMovieChannel: (channelId: string) => Promise<unknown>,
): void {
  const nights = (guildId: string) => upcomingItems(store, guildId).filter((item) => item.kind === "movie-night");

  tools.push({
    name: "list_upcoming_movie_nights",
    description: "List upcoming movie nights in this server, ordered by date. Available only in the movie-night channel.",
    parameters: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: 25, description: "Defaults to 10" } } },
    async execute(context, value) {
      await requireMovieChannel(context.channelId);
      const input = objectArguments(value);
      const items = nights(context.guild.id).slice(0, requestedLimit(input.limit));
      return JSON.stringify({ movie_nights: items.map((item) => itemSummary(item)), total_returned: items.length });
    },
  });

  tools.push({
    name: "list_my_upcoming_movie_nights",
    description: "List upcoming movie nights where the requesting user RSVP'd Going, optionally including Maybe. Available only in the movie-night channel.",
    parameters: { type: "object", additionalProperties: false, properties: {
      include_maybe: { type: "boolean", description: "Defaults to false" },
      limit: { type: "integer", minimum: 1, maximum: 25, description: "Defaults to 10" },
    } },
    async execute(context, value) {
      await requireMovieChannel(context.channelId);
      const input = objectArguments(value);
      if (input.include_maybe !== undefined && typeof input.include_maybe !== "boolean") throw new Error("include_maybe must be true or false.");
      const accepted = input.include_maybe ? new Set(["yes", "maybe"]) : new Set(["yes"]);
      const items = nights(context.guild.id).filter((item) => accepted.has(item.rsvps[context.userId] ?? "")).slice(0, requestedLimit(input.limit));
      return JSON.stringify({ movie_nights: items.map((item) => itemSummary(item, context.userId)), total_returned: items.length });
    },
  });

  tools.push({
    name: "get_movie_night_attendance",
    description: "Get attendance and remaining availability for one upcoming movie night. Available only in the movie-night channel.",
    parameters: { type: "object", additionalProperties: false, required: ["movie_night_id"], properties: { movie_night_id: { type: "string", description: "Stable ID such as movie-night:abcd1234" } } },
    async execute(context, value) {
      await requireMovieChannel(context.channelId);
      const input = objectArguments(value);
      if (typeof input.movie_night_id !== "string") throw new Error("movie_night_id is required.");
      const item = findUpcomingItem(store, context.guild.id, input.movie_night_id);
      if (!item || item.kind !== "movie-night") throw new Error("That upcoming movie night could not be found.");
      return JSON.stringify({ movie_night: itemSummary(item), attendance: attendance(item) });
    },
  });

  tools.push({
    name: "create_movie_night_reminder",
    description: "Post or schedule an organizer-only reminder for an upcoming movie night. Available only in the movie-night channel. Omit when to post now.",
    parameters: { type: "object", additionalProperties: false, required: ["movie_night_id"], properties: {
      movie_night_id: { type: "string", description: "Stable movie-night ID" },
      when: { type: "string", description: `Optional future date/time; defaults to ${timeZone} without an offset` },
      message: { type: "string", description: "Optional note, maximum 1000 characters" },
    } },
    async execute(context, value) {
      await requireMovieChannel(context.channelId);
      const input = objectArguments(value);
      if (typeof input.movie_night_id !== "string") throw new Error("movie_night_id is required.");
      const item = findUpcomingItem(store, context.guild.id, input.movie_night_id);
      if (!item || item.kind !== "movie-night") throw new Error("That upcoming movie night could not be found.");
      return createReminder(client, store, context, item, parseReminderArguments(input), timeZone);
    },
  });
}
