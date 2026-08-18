import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEventMessageService } from "../../../src/commands/event/messages.js";
import type { CommunityEvent } from "../../../src/commands/event/types.js";
import type { Client } from "discord.js";

describe("event message service", () => {
  it("unpins the primary message when the event is closed", async () => {
    let edited = false;
    let unpinned = false;
    const message = {
      pinned: true,
      async edit() {
        edited = true;
      },
      async unpin() {
        unpinned = true;
      },
    };
    const client = {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          isDMBased: () => false,
          messages: { fetch: async () => message },
        }),
      },
    } as unknown as Client;
    const event: CommunityEvent = {
      id: "event",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      creatorId: "creator",
      name: "Conference",
      schedule: { type: "timed", startsAt: 1, endsAt: 2 },
      closedAt: Date.now(),
      rsvps: {},
      createdAt: 0,
    };

    await createEventMessageService(client).update(event);

    assert.equal(edited, true);
    assert.equal(unpinned, true);
  });

  it("keeps an open event pinned when updating its message", async () => {
    let unpinned = false;
    const client = {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          isDMBased: () => false,
          messages: {
            fetch: async () => ({
              async edit() {},
              async unpin() {
                unpinned = true;
              },
            }),
          },
        }),
      },
    } as unknown as Client;
    const event: CommunityEvent = {
      id: "event",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      creatorId: "creator",
      name: "Conference",
      schedule: { type: "timed", startsAt: 4_102_444_800, endsAt: 4_102_455_600 },
      rsvps: {},
      createdAt: 0,
    };

    await createEventMessageService(client).update(event);

    assert.equal(unpinned, false);
  });

  it("pins an existing open event and unpins an existing expired event during reconciliation", async () => {
    let pinned = false;
    let unpinned = false;
    const message = {
      pinned: false,
      async pin() {
        pinned = true;
        message.pinned = true;
      },
      async unpin() {
        unpinned = true;
      },
    };
    const client = {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          isDMBased: () => false,
          messages: { fetch: async () => message },
        }),
      },
    } as unknown as Client;
    const service = createEventMessageService(client);
    const event: CommunityEvent = {
      id: "event",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      creatorId: "creator",
      name: "Conference",
      schedule: { type: "timed", startsAt: 4_102_444_800, endsAt: 4_102_455_600 },
      rsvps: {},
      createdAt: 0,
    };

    await service.reconcilePin(event);
    assert.equal(pinned, true);

    event.schedule = { type: "timed", startsAt: 1, endsAt: 2 };
    await service.reconcilePin(event);
    assert.equal(unpinned, true);
  });
});
