import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventCalendarUrl } from "../../../src/commands/event/calendar.js";
import type { CommunityEvent } from "../../../src/commands/event/types.js";

describe("event Google Calendar links", () => {
  it("prefills a timed event with its current details", () => {
    const event: CommunityEvent = {
      id: "event1",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      scheduledEventId: "scheduled",
      creatorId: "creator",
      name: "PAX West, Day 2",
      schedule: { type: "timed", startsAt: 1_788_629_400, endsAt: 1_788_658_200 },
      description: "Expo Hall: 10am to 6pm",
      rsvps: {},
      createdAt: Date.parse("2026-08-19T20:00:00Z"),
    };
    const url = new URL(eventCalendarUrl(event));

    assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
    assert.equal(url.searchParams.get("action"), "TEMPLATE");
    assert.equal(url.searchParams.get("text"), "PAX West, Day 2");
    assert.equal(url.searchParams.get("dates"), "20260905T173000Z/20260906T013000Z");
    assert.equal(
      url.searchParams.get("details"),
      "Expo Hall: 10am to 6pm\n\nhttps://discord.com/events/guild/scheduled",
    );
  });

  it("uses an exclusive end date for all-day events", () => {
    const event: CommunityEvent = {
      id: "event2",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      creatorId: "creator",
      name: "Convention",
      schedule: { type: "all-day", startsOn: "2026-09-05", endsOn: "2026-09-07", timeZone: "UTC" },
      rsvps: {},
      createdAt: Date.parse("2026-08-19T20:00:00Z"),
    };
    const url = new URL(eventCalendarUrl(event));

    assert.equal(url.searchParams.get("dates"), "20260905/20260908");
  });
});
