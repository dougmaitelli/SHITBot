import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRsvpFields, setRsvp, type Rsvps } from "../../src/shared/rsvp.js";

describe("RSVP attendance limits", () => {
  it("rejects a new Going RSVP when the limit has been reached", () => {
    const rsvps: Rsvps = { alice: "yes", bob: "maybe" };

    assert.equal(setRsvp(rsvps, "charlie", "yes", 1), false);
    assert.equal(rsvps.charlie, undefined);
  });

  it("allows people to leave a full event and frees the spot", () => {
    const rsvps: Rsvps = { alice: "yes" };

    assert.equal(setRsvp(rsvps, "alice", "no", 1), true);
    assert.equal(setRsvp(rsvps, "bob", "yes", 1), true);
    assert.deepEqual(rsvps, { alice: "no", bob: "yes" });
  });

  it("shows the attendance limit beside the Going count", () => {
    const fields = buildRsvpFields({ alice: "yes" }, 4);

    assert.equal(fields[0]?.name, "Going (1 / 4)");
  });
});
