import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { deleteExpiredRecords, EXPIRED_RECORD_RETENTION_MS } from "../src/cleanup.js";
import { BotStore } from "../src/store.js";

describe("expired record cleanup", () => {
  it("deletes events and movie nights more than 30 days past their scheduled expiration", async () => {
    const store = new BotStore(`/tmp/shitbot-cleanup-${randomUUID()}.json`);
    const now = Date.UTC(2026, 7, 18);
    const cutoffSeconds = Math.floor((now - EXPIRED_RECORD_RETENTION_MS) / 1000);

    await store.setEvent({
      id: "old-event",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      creatorId: "creator",
      name: "Old event",
      schedule: { type: "timed", startsAt: cutoffSeconds - 7200, endsAt: cutoffSeconds - 1 },
      rsvps: {},
      createdAt: 0,
    });
    await store.setEvent({
      id: "recent-event",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      creatorId: "creator",
      name: "Recent event",
      schedule: { type: "timed", startsAt: cutoffSeconds - 3600, endsAt: cutoffSeconds + 1 },
      rsvps: {},
      createdAt: 0,
      closedAt: now - EXPIRED_RECORD_RETENTION_MS - 1,
    });
    await store.set({
      id: "old-night",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      creatorId: "creator",
      startsAt: cutoffSeconds,
      location: "Theater",
      movie: null,
      votingOpen: false,
      rsvps: {},
      suggestions: [],
      createdAt: 0,
    });
    await store.set({
      id: "recent-night",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      creatorId: "creator",
      startsAt: cutoffSeconds + 1,
      location: "Theater",
      movie: null,
      votingOpen: false,
      rsvps: {},
      suggestions: [],
      createdAt: 0,
    });

    assert.deepEqual(await deleteExpiredRecords(store, now), { events: 1, movieNights: 1 });
    assert.equal(store.getEvent("old-event"), undefined);
    assert.ok(store.getEvent("recent-event"));
    assert.equal(store.get("old-night"), undefined);
    assert.ok(store.get("recent-night"));
  });
});
