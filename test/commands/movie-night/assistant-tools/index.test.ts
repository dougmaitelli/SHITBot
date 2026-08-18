import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { createMovieNightAssistantTools } from "../../../../src/commands/movie-night/assistant-tools/index.js";
import { BotStore } from "../../../../src/store.js";
import type { Client, Guild } from "discord.js";

function store(): BotStore {
  return new BotStore(`/tmp/shitbot-movie-night-assistant-tools-${randomUUID()}.json`);
}

describe("movie-night assistant tools", () => {
  it("registers only the movie-night toolset", () => {
    const tools = createMovieNightAssistantTools({} as Client, store(), "UTC", async () => undefined);

    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        "create_movie_night",
        "edit_movie_night",
        "search_movie_suggestions",
        "summarize_movie_night_suggestions",
        "list_upcoming_movie_nights",
        "list_my_upcoming_movie_nights",
        "get_movie_night_attendance",
        "create_movie_night_reminder",
      ],
    );
  });

  it("edits a managed movie night in Discord, storage, and its message", async () => {
    const saved = store();
    const startsAt = Date.parse("2100-09-01T17:00:00Z") / 1000;

    await saved.load();
    await saved.set({
      id: "night1",
      guildId: "guild",
      channelId: "movies",
      messageId: "message",
      scheduledEventId: "scheduled",
      creatorId: "organizer",
      startsAt,
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
    const tools = createMovieNightAssistantTools(client, saved, "America/Los_Angeles", async () => channel);

    const result = await tools
      .find((tool) => tool.name === "edit_movie_night")!
      .execute(
        { guild, channelId: "movies", userId: "organizer" },
        { movie_night_id: "movie-night:night1", when: "5pm", location: "New place", movie: "Arrival" },
      );

    assert.match(result, /Updated the movie night/);
    assert.equal(saved.get("night1")?.location, "New place");
    assert.equal(saved.get("night1")?.startsAt, Date.parse("2100-09-02T00:00:00Z") / 1000);
    assert.equal(saved.get("night1")?.movie, "Arrival");
    assert.equal(saved.get("night1")?.votingOpen, false);
    assert.deepEqual(scheduledEdit?.entityMetadata, { location: "New place" });
    assert.equal(messageEdited, true);
  });

  it("reports an invalid start without claiming the movie night was missing", async () => {
    const saved = store();

    await saved.load();
    await saved.set({
      id: "night2",
      guildId: "guild",
      channelId: "movies",
      messageId: "message",
      creatorId: "organizer",
      startsAt: Date.parse("2100-09-01T17:00:00Z") / 1000,
      durationMinutes: 180,
      location: "Theater",
      movie: "Arrival",
      votingOpen: false,
      rsvps: {},
      suggestions: [],
      createdAt: Date.now(),
    });
    const tools = createMovieNightAssistantTools({} as Client, saved, "America/Los_Angeles", async () => undefined);
    const edit = tools.find((tool) => tool.name === "edit_movie_night")!;
    const result = JSON.parse(
      await edit.execute(
        { guild: { id: "guild" } as Guild, channelId: "movies", userId: "organizer" },
        { movie_night_id: "movie-night:night2", when: "not a date" },
      ),
    ) as Record<string, unknown>;

    assert.equal(result.success, false);
    assert.equal(result.resource_found, true);
    assert.equal(result.resource_type, "movie-night");
    assert.equal(result.resource_id, "movie-night:night2");
    assert.equal(result.configured_timezone, "America/Los_Angeles");
    assert.match(String(result.instruction), /Do not say the resource or ID was missing/i);
  });
});
