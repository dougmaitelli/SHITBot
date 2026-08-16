import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FixedWindowRateLimiter } from "../../src/assistant/rate-limiter.js";

describe("FixedWindowRateLimiter", () => {
  it("blocks requests above the limit until the window resets", () => {
    const limiter = new FixedWindowRateLimiter(2, 1000);
    assert.equal(limiter.consume("user", 100).allowed, true);
    assert.equal(limiter.consume("user", 200).allowed, true);
    assert.deepEqual(limiter.consume("user", 300), { allowed: false, retryAfterMs: 800 });
    assert.equal(limiter.consume("user", 1100).allowed, true);
  });

  it("tracks keys independently", () => {
    const limiter = new FixedWindowRateLimiter(1, 1000);
    assert.equal(limiter.consume("alice", 0).allowed, true);
    assert.equal(limiter.consume("bob", 1).allowed, true);
  });
});
