import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GREASE_SUCCESS_CHANCE, greaseSucceeds } from "../../../src/commands/grease/index.js";

describe("greaseSucceeds", () => {
  it("succeeds for rolls below five percent", () => {
    assert.equal(GREASE_SUCCESS_CHANCE, 0.05);
    assert.equal(
      greaseSucceeds(() => 0),
      true,
    );
    assert.equal(
      greaseSucceeds(() => 0.049999),
      true,
    );
  });

  it("fails for rolls at or above five percent", () => {
    assert.equal(
      greaseSucceeds(() => 0.05),
      false,
    );
    assert.equal(
      greaseSucceeds(() => 0.99),
      false,
    );
  });
});
