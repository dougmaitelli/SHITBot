import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { GuildScheduledEventStatus, type Client, type Guild, type GuildScheduledEvent } from "discord.js";
import { createEventAssistantTools } from "../../../../src/commands/event/assistant-tools/index.js";
import { BotStore } from "../../../../src/store.js";

function store(): BotStore {
  return new BotStore(`/tmp/shitbot-event-assistant-tools-${randomUUID()}.json`);
}

describe("Discord scheduled-event assistant tools", () => {
  it("registers only event tools and keeps editing constrained to an ID", () => {
    const tools = createEventAssistantTools({} as Client, store(), "UTC", "movie-nights");

    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        "create_event",
        "edit_event",
        "list_upcoming_events",
        "list_my_upcoming_events",
        "get_event_attendance",
        "create_event_reminder",
      ],
    );
    assert.ok(tools.every((tool) => !tool.name.includes("movie")));

    const editParameters = tools.find((tool) => tool.name === "edit_event")!.parameters as {
      required?: string[];
      properties?: Record<string, unknown>;
    };

    assert.deepEqual(editParameters.required, ["event_id"]);
    assert.equal(editParameters.properties?.name_query, undefined);
  });

  it("lists scheduled events that were not created by the bot", async () => {
    const future = Date.now() + 3_600_000;
    const scheduled = {
      id: "123",
      guildId: "guild",
      channelId: null,
      creatorId: "creator",
      name: "Community Town Hall",
      description: "Monthly update",
      scheduledStartTimestamp: future,
      status: GuildScheduledEventStatus.Scheduled,
      entityMetadata: { location: "Main Hall" },
      userCount: 42,
      url: "https://discord.com/events/guild/123",
    } as unknown as GuildScheduledEvent;
    const guild = {
      id: "guild",
      scheduledEvents: { fetch: async () => new Map([[scheduled.id, scheduled]]) },
    } as unknown as Guild;
    const client = {
      channels: {
        fetch: async () => ({ isTextBased: () => true, isDMBased: () => false, name: "general" }),
      },
    } as unknown as Client;
    const tools = createEventAssistantTools(
      client,
      new BotStore("/tmp/moviebot-discord-events-test.json"),
      "UTC",
      "movie-nights",
    );

    const list = tools.find((tool) => tool.name === "list_upcoming_events")!;
    const result = JSON.parse(await list.execute({ guild, channelId: "general", userId: "user" }, {})) as {
      events: Array<Record<string, unknown>>;
    };

    assert.equal(result.events[0]?.id, "discord-event:123");
    assert.equal(result.events[0]?.title, "Community Town Hall");
    assert.equal(result.events[0]?.discord_interested, 42);
    assert.equal(result.events[0]?.discord_time, `<t:${Math.floor(future / 1000)}:F>`);
    assert.equal(result.events[0]?.starts_at, undefined);
  });

  it("edits a managed event in Discord, storage, and its message", async () => {
    const saved = store();

    await saved.load();
    await saved.setEvent({
      id: "event1",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      scheduledEventId: "scheduled",
      creatorId: "organizer",
      name: "Old name",
      schedule: { type: "timed", startsAt: 4_102_444_800, endsAt: 4_102_455_600 },
      rsvps: {},
      createdAt: Date.now(),
    });
    let scheduledEdit: Record<string, unknown> | undefined;
    let messageEdited = false;
    const guild = {
      id: "guild",
      scheduledEvents: { edit: async (_id: string, options: Record<string, unknown>) => (scheduledEdit = options) },
      channels: { fetch: async () => channel },
    } as unknown as Guild;
    const channel = {
      isTextBased: () => true,
      isDMBased: () => false,
      messages: { fetch: async () => ({ edit: async () => (messageEdited = true) }) },
    };
    const client = {
      guilds: { fetch: async () => guild },
      channels: { fetch: async () => channel },
    } as unknown as Client;
    const tools = createEventAssistantTools(client, saved, "UTC", "movie-nights");

    const result = await tools
      .find((tool) => tool.name === "edit_event")!
      .execute({ guild, channelId: "channel", userId: "organizer" }, { event_id: "event:event1", name: "New name" });

    assert.match(result, /Updated \*\*New name\*\*/);
    assert.equal(saved.getEvent("event1")?.name, "New name");
    assert.equal(scheduledEdit?.name, "New name");
    assert.equal(messageEdited, true);
  });

  it("anchors a time-only end to the configured timezone for the exact event selected by ID", async () => {
    const saved = store();
    const startsAt = Date.parse("2100-09-01T16:00:00Z") / 1000;

    await saved.load();
    await saved.setEvent({
      id: "pax1",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      scheduledEventId: "scheduled",
      creatorId: "organizer",
      name: "PAX West day 1",
      schedule: { type: "timed", startsAt, endsAt: startsAt + 180 * 60 },
      rsvps: {},
      createdAt: Date.now(),
    });
    let scheduledEdit: Record<string, unknown> | undefined;
    const guild = {
      id: "guild",
      scheduledEvents: { edit: async (_id: string, options: Record<string, unknown>) => (scheduledEdit = options) },
      channels: { fetch: async () => channel },
    } as unknown as Guild;
    const channel = {
      isTextBased: () => true,
      isDMBased: () => false,
      messages: { fetch: async () => ({ edit: async () => undefined }) },
    };
    const client = {
      guilds: { fetch: async () => guild },
      channels: { fetch: async () => channel },
    } as unknown as Client;
    const tools = createEventAssistantTools(client, saved, "America/Los_Angeles", "movie-nights");

    await tools
      .find((tool) => tool.name === "edit_event")!
      .execute({ guild, channelId: "channel", userId: "organizer" }, { event_id: "event:pax1", ends: "5pm" });

    const expectedEnd = Date.parse("2100-09-02T00:00:00Z") / 1000;

    assert.deepEqual(saved.getEvent("pax1")?.schedule, { type: "timed", startsAt, endsAt: expectedEnd });
    assert.equal(scheduledEdit?.scheduledEndTime, expectedEnd * 1000);
  });
});
