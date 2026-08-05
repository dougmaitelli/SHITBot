import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMovieNightDate } from "../src/commands/movie-night/date-parser.js";

const referenceDate = new Date("2026-08-05T12:00:00.000Z");
const losAngeles = "America/Los_Angeles";

function parse(input: string, timeZone = losAngeles): Date | null {
  const timestamp = parseMovieNightDate(input, timeZone, referenceDate);
  return timestamp === null ? null : new Date(timestamp * 1000);
}

describe("parseMovieNightDate", () => {
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
});
