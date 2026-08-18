import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { registerEventAssistantTools } from "../../src/commands/event/assistant-tools.js";
import { registerMovieNightAssistantTools } from "../../src/commands/movie-night/assistant-tools.js";
import { BotStore } from "../../src/store.js";
import type { AssistantTool } from "../../src/assistant/types.js";
import type { Client, Guild } from "discord.js";

function store(): BotStore {
  return new BotStore(`/tmp/shitbot-edit-tools-${randomUUID()}.json`);
}

describe("assistant edit tools", () => {
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
      startsAt: 4_102_444_800,
      durationMinutes: 180,
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
      messages: { fetch: async () => ({ edit: async () => (messageEdited = true) }) },
    };
    const client = { guilds: { fetch: async () => guild } } as unknown as Client;
    const tools: AssistantTool[] = [];

    registerEventAssistantTools(client, saved, tools, "UTC", "movie-nights");

    const result = await tools
      .find((tool) => tool.name === "edit_event")!
      .execute({ guild, channelId: "channel", userId: "organizer" }, { event_id: "event:event1", name: "New name" });

    assert.match(result, /Updated \*\*New name\*\*/);
    assert.equal(saved.getEvent("event1")?.name, "New name");
    assert.equal(scheduledEdit?.name, "New name");
    assert.equal(messageEdited, true);
  });

  it("anchors a time-only end to the exact event selected by ID", async () => {
    const saved = store();
    const startsAt = Date.parse("2100-09-01T09:00:00Z") / 1000;

    await saved.load();
    await saved.setEvent({
      id: "pax1",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      scheduledEventId: "scheduled",
      creatorId: "organizer",
      name: "PAX West day 1",
      startsAt,
      durationMinutes: 180,
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
      messages: { fetch: async () => ({ edit: async () => undefined }) },
    };
    const client = { guilds: { fetch: async () => guild } } as unknown as Client;
    const tools: AssistantTool[] = [];

    registerEventAssistantTools(client, saved, tools, "UTC", "movie-nights");

    await tools
      .find((tool) => tool.name === "edit_event")!
      .execute({ guild, channelId: "channel", userId: "organizer" }, { event_id: "event:pax1", ends: "5pm" });

    const expectedEnd = Date.parse("2100-09-01T17:00:00Z") / 1000;

    assert.equal(saved.getEvent("pax1")?.endsAt, expectedEnd);
    assert.equal(scheduledEdit?.scheduledEndTime, expectedEnd * 1000);
  });

  it("edits a managed movie night in Discord, storage, and its message", async () => {
    const saved = store();

    await saved.load();
    await saved.set({
      id: "night1",
      guildId: "guild",
      channelId: "movies",
      messageId: "message",
      scheduledEventId: "scheduled",
      creatorId: "organizer",
      startsAt: 4_102_444_800,
      durationMinutes: 180,
      location: "Old place",
      movie: null,
      votingOpen: true,
      rsvps: {},
      suggestions: [],
      createdAt: Date.now(),
    });
    let scheduledEdit: Record<string, unknown> | undefined;
    let messageEdited = false;
    const guild = {
      id: "guild",
      scheduledEvents: { edit: async (_id: string, options: Record<string, unknown>) => (scheduledEdit = options) },
    } as unknown as Guild;
    const channel = {
      id: "movies",
      isTextBased: () => true,
      isDMBased: () => false,
      isSendable: () => true,
      messages: { fetch: async () => ({ edit: async () => (messageEdited = true) }) },
    };
    const client = {
      guilds: { fetch: async () => guild },
      channels: { fetch: async () => channel },
    } as unknown as Client;
    const tools: AssistantTool[] = [];

    registerMovieNightAssistantTools(client, saved, tools, "UTC", async () => channel);

    const result = await tools
      .find((tool) => tool.name === "edit_movie_night")!
      .execute(
        { guild, channelId: "movies", userId: "organizer" },
        { movie_night_id: "movie-night:night1", location: "New place", movie: "Arrival" },
      );

    assert.match(result, /Updated the movie night/);
    assert.equal(saved.get("night1")?.location, "New place");
    assert.equal(saved.get("night1")?.movie, "Arrival");
    assert.equal(saved.get("night1")?.votingOpen, false);
    assert.deepEqual(scheduledEdit?.entityMetadata, { location: "New place" });
    assert.equal(messageEdited, true);
  });
});
