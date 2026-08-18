import { summarizeMovieNightSuggestions } from "../../../assistant/movie-data.js";
import { objectArguments } from "../../../assistant/tool-utils.js";
import type { MovieNightAssistantToolDependencies } from "./types.js";
import type { AssistantTool } from "../../../assistant/types.js";

export function createMovieNightSuggestionTools({
  store,
  requireMovieChannel,
  tmdb,
  availableInMovieChannel,
}: MovieNightAssistantToolDependencies): AssistantTool[] {
  return [
    {
      name: "search_movie_suggestions",
      isAvailable: availableInMovieChannel,
      description:
        "Search TMDB for movie options matching a title or short query. Available only in the movie-night channel. This does not add a suggestion or cast a vote.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", description: "Movie title or concise query, maximum 100 characters" },
        },
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
    },
    {
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
    },
  ];
}
