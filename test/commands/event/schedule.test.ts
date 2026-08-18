import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEventSchedule, editEventSchedule, scheduleEndsAt } from "../../../src/commands/event/schedule.js";

const timeZone = "America/Los_Angeles";
const reference = new Date("2026-01-01T00:00:00Z");

describe("event schedules", () => {
  it("creates timed events that span multiple days", () => {
    const schedule = createEventSchedule(
      { starts: "August 28, 2026 9am", ends: "September 1, 2026 5pm" },
      timeZone,
      reference,
    );

    assert.deepEqual(schedule, {
      type: "timed",
      startsAt: Date.parse("2026-08-28T16:00:00Z") / 1000,
      endsAt: Date.parse("2026-09-02T00:00:00Z") / 1000,
    });
  });

  it("infers all-day events from date-only starts and uses inclusive end dates", () => {
    const schedule = createEventSchedule({ starts: "October 31, 2026", ends: "November 2, 2026" }, timeZone, reference);

    assert.deepEqual(schedule, {
      type: "all-day",
      startsOn: "2026-10-31",
      endsOn: "2026-11-02",
      timeZone,
    });
    assert.equal(scheduleEndsAt(schedule), Date.parse("2026-11-03T08:00:00Z") / 1000);
  });

  it("preserves the range length when moving an all-day event", () => {
    const schedule = editEventSchedule(
      { type: "all-day", startsOn: "2026-08-28", endsOn: "2026-08-31", timeZone },
      { starts: "September 4, 2026" },
      timeZone,
    );

    assert.deepEqual(schedule, {
      type: "all-day",
      startsOn: "2026-09-04",
      endsOn: "2026-09-07",
      timeZone,
    });
  });

  it("switches a timed event to all-day when its new start is date-only", () => {
    const schedule = editEventSchedule(
      {
        type: "timed",
        startsAt: Date.parse("2026-08-28T16:00:00Z") / 1000,
        endsAt: Date.parse("2026-08-28T19:00:00Z") / 1000,
      },
      { starts: "September 4, 2026" },
      timeZone,
    );

    assert.deepEqual(schedule, {
      type: "all-day",
      startsOn: "2026-09-04",
      endsOn: "2026-09-04",
      timeZone,
    });
  });

  it("switches an all-day event to timed when its new start includes a time", () => {
    const schedule = editEventSchedule(
      { type: "all-day", startsOn: "2026-08-28", endsOn: "2026-08-31", timeZone },
      { starts: "September 4, 2026 9am" },
      timeZone,
    );

    assert.deepEqual(schedule, {
      type: "timed",
      startsAt: Date.parse("2026-09-04T16:00:00Z") / 1000,
      endsAt: Date.parse("2026-09-04T19:00:00Z") / 1000,
    });
  });
});
