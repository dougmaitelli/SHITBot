import { objectArguments } from "../../../assistant/tool-utils.js";
import { isOrganizerOrModerator } from "../../../authorization.js";
import { parseDate } from "../../../utils/date-parser.js";
import { editMovieNight } from "../actions/edit.js";
import type { MovieNightAssistantToolDependencies } from "./types.js";
import type { AssistantTool } from "../../../assistant/types.js";

export function createMovieNightEditTool({
  client,
  store,
  timeZone,
  requireMovieChannel,
  roles,
  messages,
  availableInMovieChannel,
}: MovieNightAssistantToolDependencies): AssistantTool {
  return {
    name: "edit_movie_night",
    isAvailable: availableInMovieChannel,
    description: "Edit a future bot-managed movie night. Only the organizer or a moderator may edit it.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["movie_night_id"],
      properties: {
        movie_night_id: { type: "string", description: "Stable ID returned by list_upcoming_movie_nights" },
        when: { type: "string", description: `New date and time; defaults to ${timeZone} without an offset` },
        location: { type: "string", description: "New location, maximum 200 characters" },
        movie: { type: "string", description: "New movie; empty text clears it and reopens voting" },
        duration_minutes: { type: "integer", minimum: 30, maximum: 720 },
        attendance_limit: { type: "integer", minimum: 1, maximum: 100000 },
      },
    },
    async execute(context, value) {
      await requireMovieChannel(context.channelId);
      const input = objectArguments(value);

      if (typeof input.movie_night_id !== "string") throw new Error("movie_night_id is required.");

      const night = store.get(input.movie_night_id.replace(/^movie-night:/, ""));

      if (!night || night.guildId !== context.guild.id) throw new Error("That managed movie night could not be found.");

      if (night.closedAt || night.startsAt <= Math.floor(Date.now() / 1000))
        throw new Error("That movie night has started and is no longer editable.");

      if (!(await isOrganizerOrModerator(context.guild, context.userId, night.creatorId, roles)))
        throw new Error("Only the organizer or a moderator can edit this movie night.");

      const editable = ["when", "location", "movie", "duration_minutes", "attendance_limit"];

      if (!editable.some((key) => input[key] !== undefined)) throw new Error("Provide at least one field to edit.");

      if (input.when !== undefined && typeof input.when !== "string") throw new Error("when must be text.");

      if (
        input.location !== undefined &&
        (typeof input.location !== "string" || !input.location.trim() || input.location.trim().length > 200)
      )
        throw new Error("Location must be from 1 to 200 characters.");

      if (input.movie !== undefined && (typeof input.movie !== "string" || input.movie.trim().length > 100))
        throw new Error("Movie must be text with at most 100 characters.");

      if (
        input.duration_minutes !== undefined &&
        (!Number.isInteger(input.duration_minutes) ||
          (input.duration_minutes as number) < 30 ||
          (input.duration_minutes as number) > 720)
      )
        throw new Error("Duration must be from 30 to 720 minutes.");

      if (
        input.attendance_limit !== undefined &&
        (!Number.isInteger(input.attendance_limit) ||
          (input.attendance_limit as number) < 1 ||
          (input.attendance_limit as number) > 100000)
      )
        throw new Error("Attendance limit must be from 1 to 100000.");

      const startsAt = input.when === undefined ? night.startsAt : parseDate(input.when, timeZone);

      if (!startsAt || startsAt <= Math.floor(Date.now() / 1000))
        throw new Error("Provide a valid future date and time.");

      const movie = input.movie === undefined ? night.movie : input.movie.trim() || null;
      const updated = await editMovieNight(client, store, messages, night, {
        startsAt,
        location: input.location === undefined ? night.location : input.location.trim(),
        movie,
        votingOpen: input.movie === undefined ? night.votingOpen : movie === null,
        durationMinutes: (input.duration_minutes as number | undefined) ?? night.durationMinutes ?? 180,
        attendanceLimit: (input.attendance_limit as number | undefined) ?? night.attendanceLimit,
      });

      return `Updated the movie night for <t:${updated.startsAt}:F>.`;
    },
  };
}
