import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { editEventHandler } from "../../../../src/commands/event/subcommands/edit.js";
import { BotStore } from "../../../../src/store.js";
import type { EventMessageService } from "../../../../src/commands/event/messages.js";
import type { CommandContext, GuildCommandInteraction } from "../../../../src/commands/types.js";
import type { Client, Guild } from "discord.js";

describe("event edit subcommand", () => {
  it("parses a time-only end in the configured timezone", async () => {
    const store = new BotStore(`/tmp/shitbot-event-edit-subcommand-${randomUUID()}.json`);
    const startsAt = Date.parse("2100-09-01T16:00:00Z") / 1000;

    await store.load();
    await store.setEvent({
      id: "event1",
      guildId: "guild",
      channelId: "channel",
      messageId: "message",
      scheduledEventId: "scheduled",
      creatorId: "organizer",
      name: "PAX West",
      schedule: { type: "timed", startsAt, endsAt: startsAt + 180 * 60 },
      rsvps: {},
      createdAt: Date.now(),
    });

    let scheduledEndTime: number | undefined;
    const discordGuild = {
      id: "guild",
      scheduledEvents: {
        edit: async (_id: string, changes: { scheduledEndTime?: number }) => {
          scheduledEndTime = changes.scheduledEndTime;
        },
      },
    } as unknown as Guild;
    const client = { guilds: { fetch: async () => discordGuild } } as unknown as Client;
    const messages: EventMessageService = {
      update: async () => undefined,
      reconcilePin: async () => undefined,
    };
    const values: Record<string, string | null> = {
      "event-id": "event:event1",
      ends: "5pm",
    };
    let response: string | undefined;
    const interaction = {
      guild: discordGuild,
      guildId: "guild",
      user: { id: "organizer" },
      options: {
        getString: (name: string) => values[name] ?? null,
        getInteger: () => null,
        getBoolean: () => null,
      },
      reply: async () => undefined,
      deferReply: async () => undefined,
      editReply: async (content: string) => {
        response = content;
      },
    } as unknown as GuildCommandInteraction;
    const context = {
      client,
      store,
      config: {
        timeZone: "America/Los_Angeles",
        movieNightsChannel: "movie-nights",
        tmdbApiToken: "",
        roles: { moderatorRoleId: "", adminRoleId: "" },
      },
      registerAssistantTools: () => undefined,
    } satisfies CommandContext;

    await editEventHandler(context, messages)(interaction);

    const expectedEnd = Date.parse("2100-09-02T00:00:00Z") / 1000;

    assert.deepEqual(store.getEvent("event1")?.schedule, { type: "timed", startsAt, endsAt: expectedEnd });
    assert.equal(scheduledEndTime, expectedEnd * 1000);
    assert.match(response ?? "", /Updated \*\*PAX West\*\*/);
  });
});
