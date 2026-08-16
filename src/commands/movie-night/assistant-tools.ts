import { attendance, findUpcomingItem, upcomingItems } from "../../assistant/event-data.js";
import { summarizeMovieNightSuggestions } from "../../assistant/movie-data.js";
import { createReminder, parseReminderArguments } from "../../assistant/reminder-tool.js";
import { itemSummary, objectArguments, requestedLimit } from "../../assistant/tool-utils.js";
import { parseDate } from "../../utils/date-parser.js";
import { createMovieNight } from "./create-night.js";
import type { TmdbClient } from "./tmdb.js";
import type { AssistantTool, AssistantToolContext } from "../../assistant/types.js";
import type { BotStore } from "../../store.js";
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

export function registerMovieNightAssistantTools(
  client: Client,
  store: BotStore,
  tools: AssistantTool[],
  timeZone: string,
  requireMovieChannel: (channelId: string) => Promise<unknown>,
  channelName = "movie-nights",
  tmdb?: TmdbClient,
): void {
  const nights = (guildId: string) => upcomingItems(store, guildId).filter((item) => item.kind === "movie-night");
  const availableInMovieChannel = async (context: AssistantToolContext) => {
    try {
      await requireMovieChannel(context.channelId);
      return true;
    } catch {
      return false;
    }
  };

  tools.push({
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
  });

  tools.push({
    name: "search_movie_suggestions",
    isAvailable: availableInMovieChannel,
    description:
      "Search TMDB for movie options matching a title or short query. Available only in the movie-night channel. This does not add a suggestion or cast a vote.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: { query: { type: "string", description: "Movie title or concise query, maximum 100 characters" } },
    },
    async execute(context, value) {
      await requireMovieChannel(context.channelId);
      if (!tmdb) throw new Error("TMDB search is unavailable.");
      const input = objectArguments(value);
      if (typeof input.query !== "string") throw new Error("A movie search query is required.");
      const query = input.query.trim();
      if (!query || query.length > 100) throw new Error("The movie search query must be from 1 to 100 characters.");
      const matches = await tmdb.searchMovies(query);
      const detailed = await Promise.all(
        matches.map(async (match) => {
          try {
            return await tmdb.getMovieDetails(match.tmdbId);
          } catch {
            return match;
          }
        }),
      );
      return JSON.stringify({
        query,
        results: detailed.map((movie) => ({
          title: movie.title,
          release_year: movie.releaseYear ?? null,
          tmdb_id: movie.tmdbId,
          description:
            "description" in movie && typeof movie.description === "string" ? movie.description.slice(0, 500) : null,
          rating: "rating" in movie && typeof movie.rating === "number" ? movie.rating : null,
          imdb_url:
            "imdbId" in movie && typeof movie.imdbId === "string"
              ? `https://www.imdb.com/title/${movie.imdbId}/`
              : null,
        })),
        attribution:
          "Movie data provided by TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.",
      });
    },
  });

  tools.push({
    name: "summarize_movie_night_suggestions",
    isAvailable: availableInMovieChannel,
    description:
      "Summarize suggestions, vote counts, leaders, selected movie, voting status, and the requesting user's vote for an upcoming movie night. Available only in the movie-night channel.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["movie_night_id"],
      properties: { movie_night_id: { type: "string", description: "Stable movie-night ID" } },
    },
    async execute(context, value) {
      await requireMovieChannel(context.channelId);
      const input = objectArguments(value);
      if (typeof input.movie_night_id !== "string") throw new Error("movie_night_id is required.");
      const summary = summarizeMovieNightSuggestions(store, context.guild.id, input.movie_night_id, context.userId);
      if (!summary) throw new Error("That upcoming movie night could not be found.");
      return JSON.stringify(summary);
    },
  });

  tools.push({
    name: "list_upcoming_movie_nights",
    isAvailable: availableInMovieChannel,
    description:
      "List upcoming movie nights in this server, ordered by date. Available only in the movie-night channel.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { limit: { type: "integer", minimum: 1, maximum: 25, description: "Defaults to 10" } },
    },
    async execute(context, value) {
      await requireMovieChannel(context.channelId);
      const input = objectArguments(value);
      const items = nights(context.guild.id).slice(0, requestedLimit(input.limit));
      return JSON.stringify({ movie_nights: items.map((item) => itemSummary(item)), total_returned: items.length });
    },
  });

  tools.push({
    name: "list_my_upcoming_movie_nights",
    isAvailable: availableInMovieChannel,
    description:
      "List upcoming movie nights where the requesting user RSVP'd Going, optionally including Maybe. Available only in the movie-night channel.",
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
        movie_nights: items.map((item) => itemSummary(item, context.userId)),
        total_returned: items.length,
      });
    },
  });

  tools.push({
    name: "get_movie_night_attendance",
    isAvailable: availableInMovieChannel,
    description:
      "Get attendance and remaining availability for one upcoming movie night. Available only in the movie-night channel.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["movie_night_id"],
      properties: { movie_night_id: { type: "string", description: "Stable ID such as movie-night:abcd1234" } },
    },
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
    isAvailable: availableInMovieChannel,
    description:
      "Post or schedule an organizer-only reminder for an upcoming movie night. Available only in the movie-night channel. Omit when to post now.",
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
      return createReminder(client, store, context, item, parseReminderArguments(input), timeZone);
    },
  });
}
