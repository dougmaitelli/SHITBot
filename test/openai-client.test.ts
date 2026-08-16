import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Guild } from "discord.js";
import { OpenAICompatibleClient } from "../src/assistant/openai-client.js";
import type { AssistantTool } from "../src/assistant/types.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function client() {
  return new OpenAICompatibleClient({
    apiKey: "secret", baseUrl: "https://provider.example/v1/", model: "model", maxOutputTokens: 200, timeoutMs: 1000,
  });
}

const context = { guild: {} as Guild, channelId: "channel", userId: "user" };

describe("OpenAICompatibleClient", () => {
  it("calls the configured chat completions endpoint", async () => {
    let request: { url?: string; authorization?: string; body?: Record<string, unknown> } = {};
    globalThis.fetch = async (input, init) => {
      request = {
        url: String(input), authorization: new Headers(init?.headers).get("authorization") ?? undefined,
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      };
      return new Response(JSON.stringify({ choices: [{ message: { content: "Hello" } }] }));
    };

    assert.equal(await client().respond("Hi", context, [], "System"), "Hello");
    assert.equal(request.url, "https://provider.example/v1/chat/completions");
    assert.equal(request.authorization, "Bearer secret");
    assert.equal(request.body?.model, "model");
    assert.equal(request.body?.tools, undefined);
  });

  it("supports providers that do not require an API key", async () => {
    let authorization: string | null = "not called";
    globalThis.fetch = async (_input, init) => {
      authorization = new Headers(init?.headers).get("authorization");
      return new Response(JSON.stringify({ choices: [{ message: { content: "Hello" } }] }));
    };
    const unauthenticated = new OpenAICompatibleClient({
      baseUrl: "http://localhost:1234/v1", model: "local", maxOutputTokens: 200, timeoutMs: 1000,
    });

    assert.equal(await unauthenticated.respond("Hi", context, [], "System"), "Hello");
    assert.equal(authorization, null);
  });

  it("executes function calls and returns their result to the model", async () => {
    const requests: Array<Record<string, unknown>> = [];
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(body);
      return new Response(JSON.stringify(requests.length === 1
        ? { choices: [{ message: { content: null, tool_calls: [{ id: "call", type: "function", function: { name: "create_event", arguments: "{\"name\":\"Party\"}" } }] } }] }
        : { choices: [{ message: { content: "Done" } }] }));
    };
    let received: unknown;
    const tool: AssistantTool = {
      name: "create_event", description: "Create", parameters: { type: "object" },
      async execute(_context, value) { received = value; return "Created Party"; },
    };

    assert.equal(await client().respond("Create a party", context, [tool], "System"), "Done");
    assert.deepEqual(received, { name: "Party" });
    const secondMessages = requests[1]?.messages as Array<{ role: string; content: string }>;
    assert.equal(secondMessages.at(-1)?.role, "tool");
    assert.equal(secondMessages.at(-1)?.content, "Created Party");
  });
});
