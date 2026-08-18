import { itemSummary, objectArguments, requestedLimit } from "../../../assistant/tool-utils.js";
import type { MovieNightAssistantToolDependencies } from "./types.js";
import type { AssistantTool } from "../../../assistant/types.js";

export function createMovieNightListTools({
  requireMovieChannel,
  nights,
  availableInMovieChannel,
}: MovieNightAssistantToolDependencies): AssistantTool[] {
  return [
    {
      name: "list_upcoming_movie_nights",
      isAvailable: availableInMovieChannel,
      description:
        "List all upcoming movie nights in this server, ordered by date. This is server-wide and is not filtered by the requesting user's attendance; do not use it for requests about movie nights I, me, or my am attending. Available only in the movie-night channel.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 25, description: "Defaults to 10" },
        },
      },
      async execute(context, value) {
        await requireMovieChannel(context.channelId);
        const input = objectArguments(value);
        const items = nights(context.guild.id).slice(0, requestedLimit(input.limit));

        return JSON.stringify({
          scope: "server-wide",
          requesting_user_filtered: false,
          instruction: "These are all server movie nights, not movie nights the requesting user is attending.",
          movie_nights: items.map((item) => itemSummary(item)),
          total_returned: items.length,
        });
      },
    },
    {
      name: "list_my_upcoming_movie_nights",
      isAvailable: availableInMovieChannel,
      description:
        "List upcoming movie nights where the requesting user RSVP'd Going, optionally including Maybe. Use this for requests about movie nights I, me, or my am attending. Address the requester as you, never as I or the bot. Available only in the movie-night channel.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          include_maybe: { type: "boolean", description: "Defaults to false" },
          limit: { type: "integer", minimum: 1, maximum: 25, description: "Defaults to 10" },
        },
      },
      async execute(context, value) {
        await requireMovieChannel(context.channelId);
        const input = objectArguments(value);

        if (input.include_maybe !== undefined && typeof input.include_maybe !== "boolean")
          throw new Error("include_maybe must be true or false.");

        const accepted = input.include_maybe ? new Set(["yes", "maybe"]) : new Set(["yes"]);
        const items = nights(context.guild.id)
          .filter((item) => accepted.has(item.rsvps[context.userId] ?? ""))
          .slice(0, requestedLimit(input.limit));

        return JSON.stringify({
          scope: "requesting-user-attendance",
          requesting_user_filtered: true,
          requesting_user_id: context.userId,
          instruction:
            "These are the requesting user's movie nights. Address the requester as 'you'; never say you or the bot are attending.",
          movie_nights: items.map((item) => itemSummary(item, context.userId)),
          total_returned: items.length,
        });
      },
    },
  ];
}
