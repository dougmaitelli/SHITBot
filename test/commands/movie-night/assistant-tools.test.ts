import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { registerMovieNightAssistantTools } from "../../../src/commands/movie-night/assistant-tools.js";
import { BotStore } from "../../../src/store.js";
import type { AssistantTool } from "../../../src/assistant/types.js";
import type { Client, Guild } from "discord.js";

function store(): BotStore {
  return new BotStore(`/tmp/shitbot-movie-night-assistant-tools-${randomUUID()}.json`);
}

describe("movie-night assistant tools", () => {
  it("registers only the movie-night toolset", () => {
    const tools: AssistantTool[] = [];

    registerMovieNightAssistantTools({} as Client, store(), tools, "UTC", async () => undefined);

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
