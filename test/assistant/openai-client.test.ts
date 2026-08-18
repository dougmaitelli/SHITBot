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
    assert.equal(request.body?.cache_prompt, false);
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
    const toolResult = finalMessages.filter((message) => message.role === "tool").at(-1);

    assert.equal(toolResult?.content, "Created Party");
    assert.equal(finalMessages.at(-1)?.role, "system");
  });

  it("keeps edit tools available after listing IDs", async () => {
    const requests: Array<Record<string, unknown>> = [];

    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

      requests.push(body);

      if (requests.length === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: "list-call",
                      type: "function",
                      function: { name: "list_upcoming_events", arguments: '{"limit":25}' },
                    },
                  ],
                },
              },
            ],
          }),
        );
      }

      if (requests.length === 2) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: ["one", "two", "three", "four"].map((id) => ({
                    id: `edit-${id}`,
                    type: "function",
                    function: { name: "edit_event", arguments: `{"event_id":"event:${id}","ends":"5pm"}` },
                  })),
                },
              },
            ],
          }),
        );
      }

      return new Response(JSON.stringify({ choices: [{ message: { content: "Updated all four events." } }] }));
    };
    const edited: string[] = [];
    const tools: AssistantTool[] = [
      {
        name: "list_upcoming_events",
        description: "List events",
        parameters: { type: "object" },
        async execute() {
          return JSON.stringify({ events: ["one", "two", "three", "four"].map((id) => ({ id: `event:${id}` })) });
        },
      },
      {
        name: "edit_event",
        description: "Edit one event by ID",
        parameters: { type: "object" },
        async execute(_context, value) {
          edited.push((value as { event_id: string }).event_id);

          return "Updated";
        },
      },
    ];

    assert.equal(
      await client().respond("Edit the four events", context, tools, "List IDs, then edit each event."),
      "Updated all four events.",
    );
    assert.deepEqual(edited, ["event:one", "event:two", "event:three", "event:four"]);

    const secondTools = requests[1]?.tools as Array<{ function: { name: string } }>;
    const secondMessages = requests[1]?.messages as Array<{ role: string; content: string }>;

    assert.deepEqual(
      secondTools.map((tool) => tool.function.name),
      ["list_upcoming_events", "edit_event"],
    );
    assert.equal(secondMessages.at(-1)?.role, "system");
    assert.match(secondMessages.at(-1)?.content ?? "", /tools still available are:.*edit_event/i);
    assert.match(secondMessages.at(-1)?.content ?? "", /Do not stop after the lookup/i);
  });

  it("stops advertising tools after twenty tool calls", async () => {
    const requests: Array<Record<string, unknown>> = [];

    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

      requests.push(body);
      const callNumber = requests.length;

      return new Response(
        JSON.stringify(
          callNumber <= 20
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
    assert.equal(executions, 20);
    assert.equal(requests.length, 21);
    assert.equal(requests[20]?.tools, undefined);
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
