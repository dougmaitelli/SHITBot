import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GuildScheduledEventStatus, type Client, type Guild, type GuildScheduledEvent } from "discord.js";
import { registerEventAssistantTools } from "../../../src/commands/event/assistant-tools.js";
import { BotStore } from "../../../src/store.js";
import type { AssistantTool } from "../../../src/assistant/types.js";

describe("Discord scheduled-event assistant tools", () => {
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
      channels: { fetch: async () => ({ isTextBased: () => true, isDMBased: () => false, name: "general" }) },
    } as unknown as Client;
    const tools: AssistantTool[] = [];
    registerEventAssistantTools(
      client,
      new BotStore("/tmp/moviebot-discord-events-test.json"),
      tools,
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
});
