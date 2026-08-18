import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { createCommunityEvent } from "../../../../src/commands/event/actions/create.js";
import { BotStore } from "../../../../src/store.js";
import type { Client, Guild } from "discord.js";

function guild() {
  return {
    id: "guild",
    scheduledEvents: { create: async () => ({ id: "scheduled" }) },
  } as unknown as Guild;
}

describe("createCommunityEvent", () => {
  it("pins the managed event message before persisting it", async () => {
    const store = new BotStore(`/tmp/shitbot-event-create-${randomUUID()}.json`);
    let pinned = false;

    await store.load();
    const event = await createCommunityEvent(
      {} as Client,
      store,
      {
        guild: guild(),
        channelId: "channel",
        creatorId: "creator",
        name: "Community Picnic",
        schedule: { type: "timed", startsAt: 4_102_444_800, endsAt: 4_102_455_600 },
      },
      async () => ({
        id: "message",
        async pin() {
          pinned = true;
        },
        async delete() {},
      }),
    );

    assert.equal(pinned, true);
    assert.equal(event.messageId, "message");
    assert.equal(store.getEvent(event.id)?.messageId, "message");
  });

  it("cleans up the message and scheduled event when pinning fails", async () => {
    const store = new BotStore(`/tmp/shitbot-event-create-${randomUUID()}.json`);
    let messageDeleted = false;
    let scheduledEventDeleted = false;
    const discordGuild = guild();
    const client = {
      guilds: {
        fetch: async () => ({
          scheduledEvents: {
            delete: async () => {
              scheduledEventDeleted = true;
            },
          },
        }),
      },
    } as unknown as Client;

    await store.load();
    await assert.rejects(
      () =>
        createCommunityEvent(
          client,
          store,
          {
            guild: discordGuild,
            channelId: "channel",
            creatorId: "creator",
            name: "Community Picnic",
            schedule: { type: "timed", startsAt: 4_102_444_800, endsAt: 4_102_455_600 },
          },
          async () => ({
            id: "message",
            async pin() {
              throw new Error("Missing Manage Messages");
            },
            async delete() {
              messageDeleted = true;
            },
          }),
        ),
      /Missing Manage Messages/,
    );

    assert.equal(messageDeleted, true);
    assert.equal(scheduledEventDeleted, true);
    assert.deepEqual(store.listEvents(), []);
  });
});
