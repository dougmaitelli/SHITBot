import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasModeratorRole } from "../src/authorization.js";

const roles = { moderatorRoleId: "moderator", adminRoleId: "admin" };

describe("role authorization", () => {
  it("allows both moderator and higher admin roles", () => {
    assert.equal(hasModeratorRole(["member", "moderator"], roles), true);
    assert.equal(hasModeratorRole(["member", "admin"], roles), true);
  });

  it("allows Discord administrators without a configured role match", () => {
    assert.equal(hasModeratorRole(["member"], roles, true), true);
  });

  it("rejects unmapped roles", () => {
    assert.equal(hasModeratorRole(["member"], roles), false);
  });
});
