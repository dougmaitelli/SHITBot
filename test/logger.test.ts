import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createLogger } from "../src/logger.js";

describe("structured logger", () => {
  it("serializes errors and circular context as JSON", () => {
    let line = "";
    const logger = createLogger({
      write(value) {
        line += value;
      },
    });
    const context: { self?: unknown } = {};

    context.self = context;
    logger.error("Test failure", { error: new Error("boom"), context });

    const entry = JSON.parse(line) as Record<string, unknown>;

    assert.equal(entry.level, "error");
    assert.equal(entry.msg, "Test failure");
    assert.equal((entry.error as { message: string }).message, "boom");
    assert.equal((entry.context as { self: string }).self, "[Circular]");
  });
});
