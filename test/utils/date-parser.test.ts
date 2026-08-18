import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addZonedDays, parseDate, parseDateOnly, parseEventEnd, parseTimeOnDate } from "../../src/utils/date-parser.js";

const referenceDate = new Date("2026-08-05T12:00:00.000Z");
const losAngeles = "America/Los_Angeles";

function parse(input: string, timeZone = losAngeles): Date | null {
  const timestamp = parseDate(input, timeZone, referenceDate);

  return timestamp === null ? null : new Date(timestamp * 1000);
}

describe("parseDate", () => {
  it("interprets a natural-language time in the configured timezone", () => {
    assert.equal(parse("6 august 6pm")?.toISOString(), "2026-08-07T01:00:00.000Z");
  });

  it("accounts for standard time after daylight saving ends", () => {
    assert.equal(parse("6 january 6pm")?.toISOString(), "2027-01-07T02:00:00.000Z");
  });

  it("uses an explicit UTC offset instead of the configured timezone", () => {
    assert.equal(parse("2026-08-15 19:30-05:00")?.toISOString(), "2026-08-16T00:30:00.000Z");
  });

  it("selects a future year when the year is omitted", () => {
    assert.equal(parse("2 october 7pm")?.toISOString(), "2026-10-03T02:00:00.000Z");
  });

  it("rejects input without a complete date and time", () => {
    assert.equal(parse("2"), null);
    assert.equal(parse("October 2"), null);
    assert.equal(parse("7pm"), null);
  });

  it("rejects unrecognized input", () => {
    assert.equal(parse("not a date"), null);
  });

  it("rejects an invalid configured timezone", () => {
    assert.throws(() => parse("2 october 7pm", "Somewhere/Invalid"), RangeError);
  });

  it("parses date-only values at local midnight for all-day events", () => {
    assert.equal(
      new Date(parseDateOnly("August 15, 2026", losAngeles, referenceDate)! * 1000).toISOString(),
      "2026-08-15T07:00:00.000Z",
    );
  });

  it("adds calendar days across daylight-saving changes", () => {
    const start = parseDateOnly("October 31, 2026", losAngeles, referenceDate)!;

    assert.equal(new Date(addZonedDays(start, losAngeles, 2) * 1000).toISOString(), "2026-11-02T08:00:00.000Z");
  });

  it("parses a time-only event end on the event's date", () => {
    const startsAt = parseDate("August 28, 2026 9am", losAngeles, referenceDate)!;

    assert.equal(
      new Date(parseEventEnd("5pm", losAngeles, startsAt, false)! * 1000).toISOString(),
      "2026-08-29T00:00:00.000Z",
    );
  });

  it("anchors a time-only edit to the reference date in the configured timezone", () => {
    const reference = parseDate("August 28, 2026 10am", losAngeles, referenceDate)!;

    assert.equal(
      new Date(parseTimeOnDate("5pm", losAngeles, reference)! * 1000).toISOString(),
      "2026-08-29T00:00:00.000Z",
    );
  });
});
