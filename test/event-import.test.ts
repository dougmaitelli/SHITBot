import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adoptCommunityEvent, parseScheduledEventReference } from "../src/commands/event/create-event.js";
import { BotStore } from "../src/store.js";
import type { GuildScheduledEvent } from "discord.js";

describe("Discord event import", () => {
  it("accepts an event ID or a same-server Discord event URL", () => {
    const guildId = "123456789012345678";
    const eventId = "987654321098765432";
    assert.equal(parseScheduledEventReference(eventId, guildId), eventId);
    assert.equal(parseScheduledEventReference(`https://discord.com/events/${guildId}/${eventId}`, guildId), eventId);
    assert.throws(
      () => parseScheduledEventReference(`https://discord.com/events/111111111111111111/${eventId}`, guildId),
      /Invalid Discord event URL/,
    );
    assert.throws(() => parseScheduledEventReference("not an event", guildId), /Invalid Discord event reference/);
  });

  it("creates a managed record and post without replacing the Discord event", async () => {
    const store = new BotStore(`/tmp/moviebot-event-import-${process.pid}.json`);
    let rendered: unknown;
    const scheduledEvent = {
      id: "987654321098765432",
      name: "Community Picnic",
      description: "Bring lunch",
      scheduledStartTimestamp: 2_000_000_000_000,
    } as GuildScheduledEvent;

    const event = await adoptCommunityEvent(
      store,
      { guildId: "guild", channelId: "channel", creatorId: "organizer", attendanceLimit: 20 },
      scheduledEvent,
      async (message) => {
        rendered = message;
        return { id: "message", async delete() {} };
      },
    );

    assert.equal(event.scheduledEventId, scheduledEvent.id);
    assert.equal(event.messageId, "message");
    assert.equal(event.name, "Community Picnic");
    assert.equal(event.description, "Bring lunch");
    assert.equal(event.attendanceLimit, 20);
    assert.deepEqual(event.rsvps, {});
    assert.equal(store.getEvent(event.id)?.scheduledEventId, scheduledEvent.id);
    assert.ok(rendered);
  });
});
