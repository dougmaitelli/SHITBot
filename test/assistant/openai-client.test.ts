import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { OpenAICompatibleClient } from "../../src/assistant/openai-client.js";
import type { AssistantTool } from "../../src/assistant/types.js";
import type { Guild } from "discord.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function client() {
  return new OpenAICompatibleClient({
    apiKey: "secret",
    baseUrl: "https://provider.example/v1/",
    model: "model",
    maxOutputTokens: 200,
    timeoutMs: 1000,
  });
}

const context = { guild: {} as Guild, channelId: "channel", userId: "user" };

describe("OpenAICompatibleClient", () => {
  it("calls the configured chat completions endpoint", async () => {
    let request: { url?: string; authorization?: string; body?: Record<string, unknown> } = {};

    globalThis.fetch = async (input, init) => {
      request = {
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization") ?? undefined,
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
      baseUrl: "http://localhost:1234/v1",
      model: "local",
      maxOutputTokens: 200,
      timeoutMs: 1000,
    });

    assert.equal(await unauthenticated.respond("Hi", context, [], "System"), "Hello");
    assert.equal(authorization, null);
  });

  it("executes function calls and returns their result to the model", async () => {
    const requests: Array<Record<string, unknown>> = [];

    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

      requests.push(body);

      return new Response(
        JSON.stringify(
          requests.length === 1
            ? {
                choices: [
                  {
                    message: {
                      content: null,
                      tool_calls: [
                        {
                          id: "call",
                          type: "function",
                          function: { name: "create_event", arguments: '{"name":"Party"}' },
                        },
                      ],
                    },
                  },
                ],
              }
            : { choices: [{ message: { content: "Done" } }] },
        ),
      );
    };
    let received: unknown;
    const tool: AssistantTool = {
      name: "create_event",
      description: "Create",
      parameters: { type: "object" },
      async execute(_context, value) {
        received = value;

        return "Created Party";
      },
    };

    assert.equal(await client().respond("Create a party", context, [tool], "System"), "Done");
    assert.deepEqual(received, { name: "Party" });
    const finalMessages = requests[1]?.messages as Array<{ role: string; content: string }>;

    assert.equal(finalMessages.at(-1)?.role, "tool");
    assert.equal(finalMessages.at(-1)?.content, "Created Party");
  });

  it("stops advertising tools after three tool calls", async () => {
    const requests: Array<Record<string, unknown>> = [];

    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

      requests.push(body);
      const callNumber = requests.length;

      return new Response(
        JSON.stringify(
          callNumber <= 3
            ? {
                choices: [
                  {
                    message: {
                      content: null,
                      tool_calls: [
                        {
                          id: `call-${callNumber}`,
                          type: "function",
                          function: { name: "lookup", arguments: "{}" },
                        },
                      ],
                    },
                  },
                ],
              }
            : { choices: [{ message: { content: "Reached the limit" } }] },
        ),
      );
    };
    let executions = 0;
    const tool: AssistantTool = {
      name: "lookup",
      description: "Look up data",
      parameters: { type: "object" },
      async execute() {
        executions += 1;

        return "Result";
      },
    };

    assert.equal(await client().respond("Look things up", context, [tool], "System"), "Reached the limit");
    assert.equal(executions, 3);
    assert.equal(requests.length, 4);
    assert.equal(requests[3]?.tools, undefined);
  });

  it("retries instead of exposing tool protocol emitted as text", async () => {
    const requests: Array<Record<string, unknown>> = [];

    globalThis.fetch = async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  requests.length === 1 ? '{"tool_calls":[{"function":{"arguments":"{}"}}]}' : "A normal answer.",
              },
            },
          ],
        }),
      );
    };

    assert.equal(await client().respond("General knowledge question", context, [], "System"), "A normal answer.");
    assert.equal(requests.length, 2);
    assert.equal(requests[1]?.tools, undefined);
  });

  it("does not advertise unavailable tools to the provider", async () => {
    let request: Record<string, unknown> | undefined;

    globalThis.fetch = async (_input, init) => {
      request = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return new Response(JSON.stringify({ choices: [{ message: { content: "Answer" } }] }));
    };
    const tool: AssistantTool = {
      name: "restricted",
      description: "Restricted",
      parameters: { type: "object" },
      isAvailable: () => false,
      async execute() {
        throw new Error("Should not execute");
      },
    };

    assert.equal(await client().respond("Question", context, [tool], "System"), "Answer");
    assert.equal(request?.tools, undefined);
  });
});
