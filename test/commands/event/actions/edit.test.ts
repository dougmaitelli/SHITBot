import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { editCommunityEvent } from "../../../../src/commands/event/actions/edit.js";
import { BotStore } from "../../../../src/store.js";
import type { EventMessageService } from "../../../../src/commands/event/messages.js";
import type { CommunityEvent } from "../../../../src/commands/event/types.js";
import type { Client, Guild } from "discord.js";

describe("editCommunityEvent", () => {
  it("updates Discord, storage, and the managed message", async () => {
    const store = new BotStore(`/tmp/shitbot-event-edit-action-${randomUUID()}.json`);
    const event: CommunityEvent = {
      id: "event",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      scheduledEventId: "scheduled",
      creatorId: "creator",
      name: "Old name",
      schedule: { type: "timed", startsAt: 4_102_444_800, endsAt: 4_102_455_600 },
      rsvps: {},
      createdAt: Date.now(),
    };

    await store.load();
    await store.setEvent(event);

    let scheduledName: unknown;
    let renderedName: string | undefined;
    const guild = {
      scheduledEvents: {
        edit: async (_id: string, changes: Record<string, unknown>) => {
          scheduledName = changes.name;
        },
      },
    } as unknown as Guild;
    const client = { guilds: { fetch: async () => guild } } as unknown as Client;
    const messages: EventMessageService = {
      async update(updated) {
        renderedName = updated.name;
      },
    };

    const updated = await editCommunityEvent(client, store, messages, event, { name: "New name" });

    assert.equal(updated.name, "New name");
    assert.equal(scheduledName, "New name");
    assert.equal(store.getEvent(event.id)?.name, "New name");
    assert.equal(renderedName, "New name");
  });
});
