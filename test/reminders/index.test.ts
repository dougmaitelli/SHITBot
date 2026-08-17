import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sendDueReminders } from "../../src/reminders/index.js";
import { BotStore } from "../../src/store.js";
import type { Client } from "discord.js";

describe("event reminders", () => {
  it("posts due reminders without allowing mentions and removes them", async () => {
    const store = new BotStore("/tmp/moviebot-reminders-test.json");
    const now = Math.floor(Date.now() / 1000);

    await store.setEvent({
      id: "event",
      guildId: "guild",
      channelId: "event-channel",
      messageId: "event-message",
      creatorId: "creator",
      name: "Picnic",
      startsAt: now + 3600,
      rsvps: {},
      createdAt: Date.now(),
    });
    await store.setReminder({
      id: "reminder",
      guildId: "guild",
      channelId: "reminders",
      creatorId: "creator",
      targetRef: "event:event",
      sendAt: now,
      note: "Bring lunch @everyone",
      createdAt: Date.now(),
    });
    const sent: Array<{ content: string; allowedMentions: { parse: string[] } }> = [];
    const client = {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          isSendable: () => true,
          send: async (message: { content: string; allowedMentions: { parse: string[] } }) => {
            sent.push(message);
          },
        }),
      },
    } as unknown as Client;

    await sendDueReminders(client, store);

    assert.equal(sent.length, 1);
    assert.match(sent[0]!.content, /Reminder: Picnic/);
    assert.match(sent[0]!.content, /Bring lunch @everyone/);
    assert.deepEqual(sent[0]!.allowedMentions, { parse: [] });
    assert.deepEqual(store.listReminders(), []);
  });
});
