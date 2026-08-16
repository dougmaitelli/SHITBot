import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeMovieNightSuggestions } from "../src/assistant/movie-data.js";
import { BotStore } from "../src/store.js";

describe("movie-night suggestion summaries", () => {
  it("summarizes suggestions, leaders, and the requesting user's vote", async () => {
    const store = new BotStore("/tmp/moviebot-movie-data-test.json");
    await store.set({
      id: "night", guildId: "guild", channelId: "channel", messageId: "message", creatorId: "creator",
      startsAt: Math.floor(Date.now() / 1000) + 3600, location: "Home", movie: null, votingOpen: true,
      rsvps: {}, createdAt: Date.now(), suggestions: [
        { id: "alien", title: "Alien", releaseYear: 1979, suggestedBy: "alice", voters: ["user", "bob"] },
        { id: "thing", title: "The Thing", releaseYear: 1982, suggestedBy: "carol", voters: ["dave"] },
      ],
    });

    const summary = summarizeMovieNightSuggestions(store, "guild", "movie-night:night", "user");
    assert.equal(summary?.total_votes, 3);
    assert.deepEqual(summary?.leaders, ["Alien (1979)"]);
    assert.equal(summary?.suggestions[0]?.requesting_user_voted, true);
    assert.equal(summary?.suggestions[1]?.requesting_user_voted, false);
  });

  it("does not expose movie nights from another server", async () => {
    const store = new BotStore("/tmp/moviebot-movie-data-guild-test.json");
    await store.set({
      id: "night", guildId: "other", channelId: "channel", messageId: "message", creatorId: "creator",
      startsAt: Math.floor(Date.now() / 1000) + 3600, location: "Home", movie: null, votingOpen: true,
      rsvps: {}, suggestions: [], createdAt: Date.now(),
    });
    assert.equal(summarizeMovieNightSuggestions(store, "guild", "movie-night:night", "user"), undefined);
  });
});
