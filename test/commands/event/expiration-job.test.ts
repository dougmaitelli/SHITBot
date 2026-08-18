import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { closeExpiredEvents } from "../../../src/commands/event/expiration-job.js";
import { BotStore } from "../../../src/store.js";

describe("event expiration", () => {
  it("keeps active multi-day events open and closes them after their end", async () => {
    const store = new BotStore(`/tmp/shitbot-event-expiration-${randomUUID()}.json`);
    const now = Math.floor(Date.now() / 1000);

    await store.setEvent({
      id: "active",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      creatorId: "creator",
      name: "Active conference",
      schedule: { type: "timed", startsAt: now - 3600, endsAt: now + 3600 },
      rsvps: {},
      createdAt: 0,
    });
    await store.setEvent({
      id: "ended",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      creatorId: "creator",
      name: "Ended conference",
      schedule: { type: "timed", startsAt: now - 7200, endsAt: now - 3600 },
      rsvps: {},
      createdAt: 0,
    });
    const updated: string[] = [];

    await closeExpiredEvents(store, async (event) => {
      updated.push(event.id);
    });

    assert.equal(store.getEvent("active")?.closedAt, undefined);
    assert.equal(typeof store.getEvent("ended")?.closedAt, "number");
    assert.deepEqual(updated, ["ended"]);
  });
});
