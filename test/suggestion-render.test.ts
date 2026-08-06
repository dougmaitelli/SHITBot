import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderSuggestion } from "../src/commands/movie-night/suggestion-render.js";
import type { MovieNight, MovieSuggestion } from "../src/commands/movie-night/types.js";

function fixture(): { night: MovieNight; suggestion: MovieSuggestion } {
  const suggestion: MovieSuggestion = {
    id: "suggestion",
    title: "Alien",
    releaseYear: 1979,
    tmdbId: 348,
    imdbId: "tt0078748",
    description: "In space no one can hear you scream.",
    posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
    rating: 8.2,
    suggestedBy: "user",
    voters: ["voter"],
  };
  return {
    suggestion,
    night: {
      id: "night",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      creatorId: "creator",
      startsAt: Math.floor(Date.now() / 1000) + 3600,
      location: "Home",
      movie: null,
      votingOpen: true,
      rsvps: {},
      suggestions: [suggestion],
      createdAt: Date.now(),
    },
  };
}

describe("renderSuggestion", () => {
  it("renders movie details and a public delete button", () => {
    const { night, suggestion } = fixture();
    const rendered = renderSuggestion(night, suggestion);
    const embed = rendered.embeds[0].toJSON();
    const button = rendered.components[0].components[0].toJSON();

    assert.equal(embed.title, "Alien (1979)");
    assert.equal(embed.url, "https://www.imdb.com/title/tt0078748/");
    assert.equal(embed.thumbnail?.url, "https://image.tmdb.org/t/p/w500/poster.jpg");
    assert.equal(embed.description, "In space no one can hear you scream.");
    assert.equal(embed.fields?.find((field) => field.name === "TMDB rating")?.value, "8.2/10");
    assert.equal(button.custom_id, "deleteSuggestion:night:suggestion");
    assert.equal(button.disabled, false);
  });

  it("disables deletion after the movie night closes", () => {
    const { night, suggestion } = fixture();
    night.closedAt = Date.now();
    const button = renderSuggestion(night, suggestion).components[0].components[0].toJSON();
    assert.equal(button.disabled, true);
  });
});
