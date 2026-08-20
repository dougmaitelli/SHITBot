import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { movieNightCalendarUrl } from "../../../src/commands/movie-night/calendar.js";
import type { MovieNight } from "../../../src/commands/movie-night/types.js";

describe("movie-night Google Calendar links", () => {
  it("prefills the duration and location", () => {
    const night: MovieNight = {
      id: "night1",
      guildId: "guild",
      channelId: "movies",
      messageId: "message",
      creatorId: "creator",
      startsAt: 1_788_629_400,
      durationMinutes: 180,
      location: "Theater, Screen 2",
      movie: "Arrival",
      votingOpen: false,
      rsvps: {},
      suggestions: [],
      createdAt: Date.parse("2026-08-19T20:00:00Z"),
    };
    const url = new URL(movieNightCalendarUrl(night));

    assert.equal(url.searchParams.get("text"), "Movie Night: Arrival");
    assert.equal(url.searchParams.get("dates"), "20260905T173000Z/20260905T203000Z");
    assert.equal(url.searchParams.get("location"), "Theater, Screen 2");
  });
});
