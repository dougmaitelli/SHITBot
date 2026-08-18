import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { BotStore } from "../src/store.js";
import { calendarDateToTimestamp } from "../src/utils/date-parser.js";

describe("BotStore event migration", () => {
  it("normalizes legacy timed and all-day events and persists schema version 2", async () => {
    const filename = `/tmp/shitbot-store-migration-${randomUUID()}.json`;
    const timeZone = "America/Los_Angeles";
    const allDayStart = calendarDateToTimestamp("2100-10-31", timeZone);
    const allDayEnd = calendarDateToTimestamp("2100-11-03", timeZone);

    await writeFile(
      filename,
      JSON.stringify({
        nights: {},
        reminders: {},
        events: {
          timed: {
            id: "timed",
            guildId: "guild",
            channelId: "channel",
            messageId: "message",
            creatorId: "creator",
            name: "Legacy timed event",
            startsAt: 4_128_595_200,
            durationMinutes: 120,
            rsvps: {},
            createdAt: 0,
          },
          allDay: {
            id: "allDay",
            guildId: "guild",
            channelId: "channel",
            messageId: "message",
            creatorId: "creator",
            name: "Legacy conference",
            startsAt: allDayStart,
            endsAt: allDayEnd,
            fullDay: true,
            closedAt: Date.now(),
            rsvps: {},
            createdAt: 0,
          },
        },
      }),
      "utf8",
    );

    const store = new BotStore(filename, timeZone);

    await store.load();

    assert.deepEqual(store.getEvent("timed")?.schedule, {
      type: "timed",
      startsAt: 4_128_595_200,
      endsAt: 4_128_602_400,
    });
    assert.deepEqual(store.getEvent("allDay")?.schedule, {
      type: "all-day",
      startsOn: "2100-10-31",
      endsOn: "2100-11-02",
      timeZone,
    });
    assert.equal(store.getEvent("allDay")?.closedAt, undefined);

    const persisted = JSON.parse(await readFile(filename, "utf8")) as {
      schemaVersion: number;
      events: Record<string, Record<string, unknown>>;
    };

    assert.equal(persisted.schemaVersion, 2);
    assert.equal(persisted.events.timed?.startsAt, undefined);
    assert.equal(persisted.events.allDay?.fullDay, undefined);
  });
});
