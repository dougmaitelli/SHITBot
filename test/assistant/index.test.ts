import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boundedReply } from "../../src/assistant/index.js";

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
