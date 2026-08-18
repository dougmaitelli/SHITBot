import assert from "node:assert/strict";
import { describe, it } from "node:test";
import createEventCommand from "../../../src/commands/event/index.js";
import { BotStore } from "../../../src/store.js";
import type { AssistantTool } from "../../../src/assistant/types.js";
import type { CommandContext } from "../../../src/commands/types.js";
import type { Client } from "discord.js";

describe("event command composition", () => {
  it("assembles its subcommands and lifecycle handlers", () => {
    const assistantTools: AssistantTool[] = [];
    const context: CommandContext = {
      client: {} as Client,
      store: new BotStore("/tmp/shitbot-event-command-test.json"),
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
    const command = createEventCommand(context);

    assert.deepEqual(
      command.data.options?.map((option) => option.name),
      ["create", "import", "edit"],
    );
    assert.deepEqual(
      assistantTools.map((tool) => tool.name),
      [
        "create_event",
        "edit_event",
        "list_upcoming_events",
        "list_my_upcoming_events",
        "get_event_attendance",
        "create_event_reminder",
      ],
    );
    assert.equal(typeof command.handleInteraction, "function");
    assert.equal(typeof command.onReady, "function");
  });
});
