import type { MovieNight, MovieSuggestion } from "../types.js";
import type { APIEmbedField } from "discord.js";

const attribution =
  "\n\n[TMDB](https://www.themoviedb.org/) movie data. This product uses the TMDB API but is not endorsed or certified by TMDB.";

export function suggestionTitle(suggestion: MovieSuggestion): string {
  return `${suggestion.title}${suggestion.releaseYear ? ` (${suggestion.releaseYear})` : ""}`;
}

function renderSuggestion(suggestion: MovieSuggestion): string {
  const title = suggestionTitle(suggestion);
  const escapedTitle = title.replace(/([\\[\]])/g, "\\$1");
  const linkedTitle = suggestion.imdbId
    ? `[${escapedTitle}](https://www.imdb.com/title/${suggestion.imdbId}/)`
    : `**${title}**`;

  return `${linkedTitle} — ${suggestion.voters.length} vote(s) · suggested by <@${suggestion.suggestedBy}>`;
}

export function buildSuggestionField(night: MovieNight): APIEmbedField {
  const suggestions = night.suggestions.length
    ? night.suggestions.map(renderSuggestion).join("\n")
    : "No suggestions yet. Use **Suggest a movie** to add one.";

  return {
    name: "Movie suggestions",
    value: `${suggestions.slice(0, 1024 - attribution.length)}${attribution}`,
  };
}
