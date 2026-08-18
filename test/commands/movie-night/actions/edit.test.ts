import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { editMovieNight } from "../../../../src/commands/movie-night/actions/edit.js";
import { BotStore } from "../../../../src/store.js";
import type { MovieNightMessageService } from "../../../../src/commands/movie-night/messages.js";
import type { MovieNight } from "../../../../src/commands/movie-night/types.js";
import type { Client, Guild } from "discord.js";

describe("editMovieNight", () => {
  it("updates Discord, storage, and all managed messages", async () => {
    const store = new BotStore(`/tmp/shitbot-movie-night-edit-action-${randomUUID()}.json`);
    const night: MovieNight = {
      id: "night",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      scheduledEventId: "scheduled",
      creatorId: "creator",
      startsAt: 4_102_444_800,
      durationMinutes: 180,
      location: "Old place",
      movie: null,
      votingOpen: true,
      rsvps: {},
      suggestions: [],
      createdAt: Date.now(),
    };

    await store.load();
    await store.set(night);

    let scheduledLocation: unknown;
    let renderedLocation: string | undefined;
    const guild = {
      scheduledEvents: {
        edit: async (_id: string, changes: Record<string, unknown>) => {
          scheduledLocation = (changes.entityMetadata as { location?: unknown } | undefined)?.location;
        },
      },
    } as unknown as Guild;
    const client = { guilds: { fetch: async () => guild } } as unknown as Client;
    const messages = {
      async updateAll(updated: MovieNight) {
        renderedLocation = updated.location;
      },
    } as MovieNightMessageService;

    const updated = await editMovieNight(client, store, messages, night, { location: "New place" });

    assert.equal(updated.location, "New place");
    assert.equal(scheduledLocation, "New place");
    assert.equal(store.get(night.id)?.location, "New place");
    assert.equal(renderedLocation, "New place");
  });
});
