import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventCalendarAttachment, movieNightCalendarAttachment } from "../../src/shared/calendar.js";
import type { CommunityEvent } from "../../src/commands/event/types.js";
import type { MovieNight } from "../../src/commands/movie-night/types.js";

function contents(attachment: ReturnType<typeof eventCalendarAttachment>): string {
  assert.ok(Buffer.isBuffer(attachment.attachment));

  return attachment.attachment.toString("utf8");
}

describe("calendar attachments", () => {
  it("builds a timed event with a stable identity and Discord link", () => {
    const event: CommunityEvent = {
      id: "event1",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      scheduledEventId: "scheduled",
      creatorId: "creator",
      name: "PAX West, Day 2",
      schedule: { type: "timed", startsAt: 1_788_629_400, endsAt: 1_788_658_200 },
      description: "Expo Hall: 10am; bring ID",
      rsvps: {},
      createdAt: Date.parse("2026-08-19T20:00:00Z"),
    };
    const attachment = eventCalendarAttachment(event);
    const calendar = contents(attachment);

    assert.equal(attachment.name, "pax-west-day-2-event1.ics");
    assert.match(calendar, /UID:event-guild-event1@shitbot\r\n/);
    assert.match(calendar, /DTSTART:20260905T173000Z\r\n/);
    assert.match(calendar, /DTEND:20260906T013000Z\r\n/);
    assert.match(calendar, /SUMMARY:PAX West\\, Day 2\r\n/);
    assert.match(calendar, /Expo Hall: 10am\\; bring ID/);
    assert.match(calendar, /URL:https:\/\/discord\.com\/events\/guild\/scheduled\r\n/);
    assert.equal(calendar.endsWith("\r\n"), true);
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
    const calendar = contents(eventCalendarAttachment(event));

    assert.match(calendar, /DTSTART;VALUE=DATE:20260905\r\n/);
    assert.match(calendar, /DTEND;VALUE=DATE:20260908\r\n/);
  });

  it("includes a movie night's duration and location", () => {
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
    const calendar = contents(movieNightCalendarAttachment(night));

    assert.match(calendar, /DTSTART:20260905T173000Z\r\n/);
    assert.match(calendar, /DTEND:20260905T203000Z\r\n/);
    assert.match(calendar, /SUMMARY:Movie Night: Arrival\r\n/);
    assert.match(calendar, /LOCATION:Theater\\, Screen 2\r\n/);
  });
});
