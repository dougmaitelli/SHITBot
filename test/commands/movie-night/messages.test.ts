import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMovieNightMessageService } from "../../../src/commands/movie-night/messages.js";
import type { MovieNight } from "../../../src/commands/movie-night/types.js";
import type { Client } from "discord.js";

describe("movie-night message service", () => {
  it("unpins only the primary message when the movie night is closed", async () => {
    let unpinned = false;
    const message = {
      pinned: true,
      async edit() {},
      async unpin() {
        unpinned = true;
      },
    };
    const client = {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          isDMBased: () => false,
          messages: { fetch: async () => message },
        }),
      },
    } as unknown as Client;
    const night: MovieNight = {
      id: "night",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      creatorId: "creator",
      startsAt: 1,
      durationMinutes: 180,
      location: "Theater",
      movie: "Arrival",
      votingOpen: false,
      closedAt: Date.now(),
      rsvps: {},
      suggestions: [],
      createdAt: 0,
    };

    await createMovieNightMessageService(client).updateAll(night);

    assert.equal(unpinned, true);
  });

  it("pins an existing upcoming movie night during reconciliation", async () => {
    let pinned = false;
    const message = {
      pinned: false,
      async pin() {
        pinned = true;
      },
    };
    const client = {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          isDMBased: () => false,
          messages: { fetch: async () => message },
        }),
      },
    } as unknown as Client;
    const night: MovieNight = {
      id: "night",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      creatorId: "creator",
      startsAt: 4_102_444_800,
      durationMinutes: 180,
      location: "Theater",
      movie: null,
      votingOpen: true,
      rsvps: {},
      suggestions: [],
      createdAt: 0,
    };

    await createMovieNightMessageService(client).reconcilePin(night);

    assert.equal(pinned, true);
  });
});
