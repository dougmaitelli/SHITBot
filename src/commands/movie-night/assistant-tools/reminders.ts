import { findUpcomingItem } from "../../../assistant/event-data.js";
import { createReminder, parseReminderArguments } from "../../../assistant/reminder-tool.js";
import { objectArguments } from "../../../assistant/tool-utils.js";
import type { MovieNightAssistantToolDependencies } from "./types.js";
import type { AssistantTool } from "../../../assistant/types.js";

export function createMovieNightReminderTool({
  client,
  store,
  timeZone,
  requireMovieChannel,
  roles,
  availableInMovieChannel,
}: MovieNightAssistantToolDependencies): AssistantTool {
  return {
    name: "create_movie_night_reminder",
    isAvailable: availableInMovieChannel,
    description:
      "Post or schedule an organizer-or-moderator reminder for an upcoming movie night. Available only in the movie-night channel. Omit when to post now.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["movie_night_id"],
      properties: {
        movie_night_id: { type: "string", description: "Stable movie-night ID" },
        when: { type: "string", description: `Optional future date/time; defaults to ${timeZone} without an offset` },
        message: { type: "string", description: "Optional note, maximum 1000 characters" },
      },
    },
    async execute(context, value) {
      await requireMovieChannel(context.channelId);
      const input = objectArguments(value);

      if (typeof input.movie_night_id !== "string") throw new Error("movie_night_id is required.");

      const item = findUpcomingItem(store, context.guild.id, input.movie_night_id);

      if (!item || item.kind !== "movie-night") throw new Error("That upcoming movie night could not be found.");

      return createReminder(client, store, context, item, parseReminderArguments(input), timeZone, roles);
    },
  };
}
