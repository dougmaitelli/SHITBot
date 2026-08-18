import { attendance, findUpcomingItem } from "../../../assistant/event-data.js";
import { itemSummary, objectArguments } from "../../../assistant/tool-utils.js";
import type { MovieNightAssistantToolDependencies } from "./types.js";
import type { AssistantTool } from "../../../assistant/types.js";

export function createMovieNightAttendanceTool({
  store,
  requireMovieChannel,
  availableInMovieChannel,
}: MovieNightAssistantToolDependencies): AssistantTool {
  return {
    name: "get_movie_night_attendance",
    isAvailable: availableInMovieChannel,
    description:
      "Get attendance and remaining availability for one upcoming movie night. Available only in the movie-night channel.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["movie_night_id"],
      properties: {
        movie_night_id: { type: "string", description: "Stable ID such as movie-night:abcd1234" },
      },
    },
    async execute(context, value) {
      await requireMovieChannel(context.channelId);
      const input = objectArguments(value);

      if (typeof input.movie_night_id !== "string") throw new Error("movie_night_id is required.");

      const item = findUpcomingItem(store, context.guild.id, input.movie_night_id);

      if (!item || item.kind !== "movie-night") throw new Error("That upcoming movie night could not be found.");

      return JSON.stringify({ movie_night: itemSummary(item), attendance: attendance(item) });
    },
  };
}
