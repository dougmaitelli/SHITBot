import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Collection, type Message } from "discord.js";
import { boundedReply, currentTimeContext, mentionsBot, promptFromMention } from "../../src/assistant/index.js";

function messageWithMentions({
  content = "",
  users = [],
  roles = [],
}: {
  content?: string;
  users?: string[];
  roles?: { id: string; botId?: string }[];
}): Message {
  return {
    content,
    mentions: {
      users: new Collection(users.map((id) => [id, { id }])),
      roles: new Collection(roles.map(({ id, botId }) => [id, { id, tags: botId ? { botId } : null }])),
    },
  } as unknown as Message;
}

describe("mentionsBot", () => {
  it("accepts a direct user mention", () => {
    assert.equal(mentionsBot(messageWithMentions({ users: ["bot-id"] }), "bot-id"), true);
  });

  it("accepts the bot's managed role mention", () => {
    assert.equal(mentionsBot(messageWithMentions({ roles: [{ id: "role-id", botId: "bot-id" }] }), "bot-id"), true);
  });

  it("rejects roles that are not managed by the bot", () => {
    assert.equal(
      mentionsBot(
        messageWithMentions({
          roles: [{ id: "ordinary-role" }, { id: "other-bot-role", botId: "other-bot" }],
        }),
        "bot-id",
      ),
      false,
    );
  });
});

describe("promptFromMention", () => {
  it("removes a direct bot mention", () => {
    const message = messageWithMentions({ content: "<@bot-id> when is movie night?", users: ["bot-id"] });

    assert.equal(promptFromMention(message, "bot-id"), "when is movie night?");
  });

  it("removes the bot's managed role mention", () => {
    const message = messageWithMentions({
      content: "<@&role-id> when is movie night?",
      roles: [{ id: "role-id", botId: "bot-id" }],
    });

    assert.equal(promptFromMention(message, "bot-id"), "when is movie night?");
  });
});

describe("boundedReply", () => {
  it("leaves responses within the limit unchanged", () => {
    assert.equal(boundedReply("Short answer", 20), "Short answer");
  });

  it("truncates responses to the exact configured limit", () => {
    const result = boundedReply("abcdefghijklmnopqrstuvwxyz", 10);

    assert.equal(result, "abcdefg...");
    assert.equal(result.length, 10);
  });

  it("converts millisecond Discord timestamps to seconds", () => {
    assert.equal(boundedReply("Starts <t:1760000000000:F>", 100), "Starts <t:1760000000:F>");
  });
});

describe("currentTimeContext", () => {
  it("provides both the configured local time and UTC instant", () => {
    const context = currentTimeContext("America/Los_Angeles", new Date("2026-08-18T05:30:00.000Z"));

    assert.match(context, /America\/Los_Angeles/);
    assert.match(context, /Monday, August 17, 2026 at 10:30:00 PM PDT/);
    assert.match(context, /2026-08-18T05:30:00.000Z/);
  });
});
