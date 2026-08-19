import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { BotStore } from "../src/store.js";

describe("BotStore", () => {
  it("renames and loads the legacy movie-nights database", async () => {
    const directory = `/tmp/shitbot-store-migration-${randomUUID()}`;
    const legacyFilename = `${directory}/movie-nights.json`;
    const filename = `${directory}/shitbot.json`;

    await mkdir(directory);
    await writeFile(
      legacyFilename,
      JSON.stringify({
        schemaVersion: 2,
        nights: { legacy: { id: "legacy" } },
        events: {},
        reminders: {},
      }),
      "utf8",
    );

    const store = new BotStore(filename);

    await store.load();

    assert.equal(store.get("legacy")?.id, "legacy");
    assert.doesNotReject(readFile(filename, "utf8"));
    await assert.rejects(readFile(legacyFilename, "utf8"), { code: "ENOENT" });
  });

  it("loads events stored with the current schedule schema", async () => {
    const filename = `/tmp/shitbot-store-${randomUUID()}.json`;

    await writeFile(
      filename,
      JSON.stringify({
        schemaVersion: 2,
        nights: {},
        reminders: {},
        events: {
          timed: {
            id: "timed",
            guildId: "guild",
            channelId: "channel",
            messageId: "message",
            creatorId: "creator",
            name: "Timed event",
            schedule: { type: "timed", startsAt: 4_128_595_200, endsAt: 4_128_602_400 },
            rsvps: {},
            createdAt: 0,
          },
        },
      }),
      "utf8",
    );

    const store = new BotStore(filename);

    await store.load();

    assert.deepEqual(store.getEvent("timed")?.schedule, {
      type: "timed",
      startsAt: 4_128_595_200,
      endsAt: 4_128_602_400,
    });
  });
});
