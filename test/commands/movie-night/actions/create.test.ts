import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { createMovieNight } from "../../../../src/commands/movie-night/actions/create.js";
import { BotStore } from "../../../../src/store.js";
import type { Client, Guild } from "discord.js";

describe("createMovieNight", () => {
  it("pins the managed movie-night message before persisting it", async () => {
    const store = new BotStore(`/tmp/shitbot-movie-night-create-${randomUUID()}.json`);
    const guild = {
      id: "guild",
      scheduledEvents: { create: async () => ({ id: "scheduled" }) },
    } as unknown as Guild;
    let pinned = false;
    let calendarFilename: string | undefined;

    await store.load();
    const night = await createMovieNight(
      {} as Client,
      store,
      {
        guild,
        channelId: "channel",
        creatorId: "creator",
        startsAt: 4_102_444_800,
        durationMinutes: 180,
        location: "Theater",
        movie: "Arrival",
      },
      async (options) => {
        calendarFilename = options.files?.[0]?.name;

        return {
          id: "message",
          async pin() {
            pinned = true;
          },
          async delete() {},
        };
      },
    );

    assert.equal(pinned, true);
    assert.equal(night.messageId, "message");
    assert.equal(store.get(night.id)?.messageId, "message");
    assert.equal(calendarFilename, `movie-night-arrival-${night.id}.ics`);
  });
});
