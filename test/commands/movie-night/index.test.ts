import assert from "node:assert/strict";
import { describe, it } from "node:test";
import createMovieNightCommand from "../../../src/commands/movie-night/index.js";
import { BotStore } from "../../../src/store.js";
import type { AssistantTool } from "../../../src/assistant/types.js";
import type { CommandContext } from "../../../src/commands/types.js";
import type { Client } from "discord.js";

describe("movie-night command composition", () => {
  it("assembles its subcommands and lifecycle handlers", () => {
    const assistantTools: AssistantTool[] = [];
    const context: CommandContext = {
      client: {} as Client,
      store: new BotStore("/tmp/shitbot-movie-night-command-test.json"),
      config: {
        timeZone: "UTC",
        movieNightsChannel: "movie-nights",
        tmdbApiToken: "token",
        roles: { moderatorRoleId: "", adminRoleId: "" },
      },
      registerAssistantTools(...tools): void {
        assistantTools.push(...tools);
      },
    };
    const command = createMovieNightCommand(context);

    assert.deepEqual(
      command.data.options?.map((option) => option.name),
      ["create", "edit"],
    );
    assert.deepEqual(
      assistantTools.map((tool) => tool.name),
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
    assert.equal(typeof command.handleInteraction, "function");
    assert.equal(typeof command.onReady, "function");
  });
});
