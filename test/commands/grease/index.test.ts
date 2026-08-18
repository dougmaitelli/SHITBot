import assert from "node:assert/strict";
import { describe, it } from "node:test";
import createGreaseCommand, { GREASE_SUCCESS_CHANCE, greaseSucceeds } from "../../../src/commands/grease/index.js";
import { BotStore } from "../../../src/store.js";
import type { CommandContext } from "../../../src/commands/types.js";
import type { Client } from "discord.js";

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

describe("grease command composition", () => {
  it("registers a store-loaded lifecycle hook", () => {
    const context = {
      client: {} as Client,
      store: new BotStore("/tmp/shitbot-grease-command-test.json"),
      config: {
        timeZone: "UTC",
        movieNightsChannel: "movie-nights",
        tmdbApiToken: "token",
        roles: { moderatorRoleId: "", adminRoleId: "" },
      },
      registerAssistantTools: () => undefined,
    } satisfies CommandContext;

    assert.equal(typeof createGreaseCommand(context).onStoreLoaded, "function");
  });
});
