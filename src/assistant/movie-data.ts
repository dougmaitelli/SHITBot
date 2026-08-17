import type { BotStore } from "../store.js";

export function summarizeMovieNightSuggestions(store: BotStore, guildId: string, ref: string, userId: string) {
  const match = /^movie-night:([a-zA-Z0-9-]+)$/.exec(ref);
  const night = match?.[1] ? store.get(match[1]) : undefined;
  const now = Math.floor(Date.now() / 1000);

  if (!night || night.guildId !== guildId || night.closedAt || night.startsAt <= now) return undefined;

  const suggestions = night.suggestions.map((suggestion) => ({
    id: suggestion.id,
    title: `${suggestion.title}${suggestion.releaseYear ? ` (${suggestion.releaseYear})` : ""}`,
    votes: suggestion.voters.length,
    suggested_by: `<@${suggestion.suggestedBy}>`,
    requesting_user_voted: suggestion.voters.includes(userId),
    tmdb_rating: suggestion.rating ?? null,
    imdb_url: suggestion.imdbId ? `https://www.imdb.com/title/${suggestion.imdbId}/` : null,
  }));
  const highestVotes = suggestions.length ? Math.max(...suggestions.map((suggestion) => suggestion.votes)) : 0;

  return {
    id: ref,
    discord_time: `<t:${night.startsAt}:F>`,
    voting_open: night.votingOpen,
    selected_movie: night.movie,
    total_votes: suggestions.reduce((total, suggestion) => total + suggestion.votes, 0),
    leaders: suggestions
      .filter((suggestion) => suggestion.votes === highestVotes && highestVotes > 0)
      .map((suggestion) => suggestion.title),
    suggestions,
  };
}
