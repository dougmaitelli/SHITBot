import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { editExternalScheduledEvent } from "../../src/shared/scheduled-event.js";
import type { Client, Guild } from "discord.js";

function clientWithEdit(edit: (id: string, changes: Record<string, unknown>) => Promise<void>): Client {
  const guild = { scheduledEvents: { edit } } as unknown as Guild;

  return { guilds: { fetch: async () => guild } } as unknown as Client;
}

describe("scheduled event editing", () => {
  it("edits only the supplied fields", async () => {
    let received: { id: string; changes: Record<string, unknown> } | undefined;
    const client = clientWithEdit(async (id, changes) => {
      received = { id, changes };
    });

    await editExternalScheduledEvent(client, { guildId: "guild", scheduledEventId: "event" }, { name: "New name" });

    assert.deepEqual(received, { id: "event", changes: { name: "New name" } });
  });

  it("translates a full event update to Discord fields", async () => {
    let received: Record<string, unknown> | undefined;
    const client = clientWithEdit(async (_id, changes) => {
      received = changes;
    });

    await editExternalScheduledEvent(
      client,
      { guildId: "guild", scheduledEventId: "event" },
      {
        name: "Event",
        description: "Description",
        location: "Venue",
        startsAt: 1_000,
        durationMinutes: 90,
      },
    );

    assert.deepEqual(received, {
      name: "Event",
      description: "Description",
      entityMetadata: { location: "Venue" },
      scheduledStartTime: 1_000_000,
      scheduledEndTime: 6_400_000,
    });
  });
});
