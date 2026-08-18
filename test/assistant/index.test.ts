import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boundedReply, currentTimeContext } from "../../src/assistant/index.js";

describe("boundedReply", () => {
  it("leaves responses within the limit unchanged", () => {
    assert.equal(boundedReply("Short answer", 20), "Short answer");
  });

  it("truncates responses to the exact configured limit", () => {
    const result = boundedReply("abcdefghijklmnopqrstuvwxyz", 10);

    assert.equal(result, "abcdefg...");
    assert.equal(result.length, 10);
  });

  it("converts millisecond Discord timestamps to seconds", () => {
    assert.equal(boundedReply("Starts <t:1760000000000:F>", 100), "Starts <t:1760000000:F>");
  });
});

describe("currentTimeContext", () => {
  it("provides both the configured local time and UTC instant", () => {
    const context = currentTimeContext("America/Los_Angeles", new Date("2026-08-18T05:30:00.000Z"));

    assert.match(context, /America\/Los_Angeles/);
    assert.match(context, /Monday, August 17, 2026 at 10:30:00 PM PDT/);
    assert.match(context, /2026-08-18T05:30:00.000Z/);
    assert.match(context, /relative date\/time expressions.*unchanged/i);
  });
});
