import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerEventAssistantTools } from "../../src/commands/event/assistant-tools.js";
import { registerMovieNightAssistantTools } from "../../src/commands/movie-night/assistant-tools.js";
import { BotStore } from "../../src/store.js";
import type { AssistantTool } from "../../src/assistant/types.js";
import type { Client } from "discord.js";

describe("domain assistant-tool registration", () => {
  it("registers separate event and movie-night toolsets", () => {
    const client = {} as Client;
    const store = new BotStore("/tmp/moviebot-tool-registration-test.json");
    const eventTools: AssistantTool[] = [];
    const movieTools: AssistantTool[] = [];
    registerEventAssistantTools(client, store, eventTools, "UTC", "movie-nights");
    registerMovieNightAssistantTools(client, store, movieTools, "UTC", async () => undefined);

    assert.deepEqual(
      eventTools.map((tool) => tool.name),
      [
        "create_event",
        "list_upcoming_events",
        "list_my_upcoming_events",
        "get_event_attendance",
        "create_event_reminder",
      ],
    );
    assert.deepEqual(
      movieTools.map((tool) => tool.name),
      [
        "create_movie_night",
        "search_movie_suggestions",
        "summarize_movie_night_suggestions",
        "list_upcoming_movie_nights",
        "list_my_upcoming_movie_nights",
        "get_movie_night_attendance",
        "create_movie_night_reminder",
      ],
    );
    assert.ok(eventTools.every((tool) => !tool.name.includes("movie")));
  });
});
