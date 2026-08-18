import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderNight } from "../../../../src/commands/movie-night/renderers/night.js";
import type { MovieNight } from "../../../../src/commands/movie-night/types.js";

function movieNight(): MovieNight {
  return {
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
    suggestions: [
      {
        id: "suggestion",
        title: "Alien",
        releaseYear: 1979,
        tmdbId: 348,
        imdbId: "tt0078748",
        suggestedBy: "user",
        voters: [],
      },
    ],
    createdAt: Date.now(),
  };
}

describe("renderNight", () => {
  it("links matched suggestions to IMDb and attributes TMDB", () => {
    const embed = renderNight(movieNight()).embeds[0].toJSON();
    const suggestions = embed.fields?.find((field) => field.name === "Movie suggestions")?.value;

    assert.match(suggestions ?? "", /\[Alien \(1979\)\]\(https:\/\/www\.imdb\.com\/title\/tt0078748\/\)/);
    assert.match(suggestions ?? "", /This product uses the TMDB API but is not endorsed or certified by TMDB/);
  });
});
