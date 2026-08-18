import { objectArguments } from "../../../assistant/tool-utils.js";
import { parseDate } from "../../../utils/date-parser.js";
import { createMovieNight } from "../actions/create.js";
import type { MovieNightAssistantToolDependencies } from "./types.js";
import type { AssistantTool } from "../../../assistant/types.js";
import type { Client } from "discord.js";

interface MovieNightToolArguments {
  when: string;
  location: string;
  movie?: string;
  duration_minutes?: number;
  attendance_limit?: number;
}

function creationArguments(value: unknown): MovieNightToolArguments {
  const input = objectArguments(value);

  if (typeof input.when !== "string" || !input.when.trim()) throw new Error("A date and time are required.");

  if (typeof input.location !== "string" || !input.location.trim()) throw new Error("A location is required.");

  if (input.movie !== undefined && typeof input.movie !== "string") throw new Error("Movie must be text.");

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

  return input as unknown as MovieNightToolArguments;
}

export function createMovieNightCreationTool({
  client,
  store,
  timeZone,
  requireMovieChannel,
  channelName,
  availableInMovieChannel,
}: MovieNightAssistantToolDependencies): AssistantTool {
  return {
    name: "create_movie_night",
    isAvailable: availableInMovieChannel,
    description: `Create a movie night in #${channelName}. Use only when explicitly requested. Omit movie to enable suggestions and voting.`,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["when", "location"],
      properties: {
        when: { type: "string", description: `Date and time; defaults to ${timeZone} when no offset is given` },
        location: { type: "string", description: "Location, maximum 200 characters" },
        movie: { type: "string", description: "Optional selected movie; omit for suggestions and voting" },
        duration_minutes: { type: "integer", minimum: 30, maximum: 720, description: "Defaults to 180" },
        attendance_limit: { type: "integer", minimum: 1, maximum: 100000 },
      },
    },
    async execute(context, value) {
      const channel = (await requireMovieChannel(context.channelId)) as Awaited<
        ReturnType<Client["channels"]["fetch"]>
      >;

      if (!channel?.isTextBased() || !channel.isSendable()) throw new Error(`I can't send to #${channelName}.`);

      const input = creationArguments(value);
      const startsAt = parseDate(input.when, timeZone);

      if (!startsAt) throw new Error("I couldn't understand the movie-night date and time.");

      if (startsAt <= Math.floor(Date.now() / 1000))
        throw new Error("The movie night must be scheduled in the future.");

      const location = input.location.trim();

      if (location.length > 200) throw new Error("The location must be at most 200 characters.");

      const movie = input.movie?.trim() || null;

      if (movie && movie.length > 100) throw new Error("The movie title must be at most 100 characters.");

      const night = await createMovieNight(
        client,
        store,
        {
          guild: context.guild,
          channelId: channel.id,
          creatorId: context.userId,
          startsAt,
          location,
          movie,
          attendanceLimit: input.attendance_limit,
          durationMinutes: input.duration_minutes ?? 180,
        },
        (options) => channel.send(options),
      );

      return `Created the movie night for <t:${night.startsAt}:F> in <#${night.channelId}>.`;
    },
  };
}
