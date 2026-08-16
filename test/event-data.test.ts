import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attendance, upcomingItems } from "../src/assistant/event-data.js";
import { BotStore } from "../src/store.js";

describe("assistant event data", () => {
  it("combines and orders upcoming events and movie nights", async () => {
    const store = new BotStore("/tmp/moviebot-event-data-test.json");
    await store.set({
      id: "night",
      guildId: "guild",
      channelId: "movies",
      messageId: "message",
      creatorId: "creator",
      startsAt: 300,
      location: "Home",
      movie: null,
      votingOpen: true,
      rsvps: { user: "yes" },
      suggestions: [],
      createdAt: 0,
    });
    await store.setEvent({
      id: "event",
      guildId: "guild",
      channelId: "events",
      messageId: "message",
      creatorId: "creator",
      name: "Picnic",
      startsAt: 200,
      attendanceLimit: 3,
      rsvps: { user: "yes", maybe: "maybe" },
      createdAt: 0,
    });

    const items = upcomingItems(store, "guild", 100);
    assert.deepEqual(
      items.map((item) => item.ref),
      ["event:event", "movie-night:night"],
    );
    assert.deepEqual(attendance(items[0]!), {
      goingCount: 1,
      maybeCount: 1,
      notGoingCount: 0,
      going: ["<@user>"],
      maybe: ["<@maybe>"],
      notGoing: [],
      attendeeListsTruncated: false,
      discordInterestedCount: null,
      attendanceLimit: 3,
      spotsAvailable: 2,
    });
  });
});
