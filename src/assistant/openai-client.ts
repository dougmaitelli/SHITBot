import type { AssistantTool, AssistantToolContext } from "./types.js";

const MAX_TOOL_RESULT_CHARACTERS = 16_000;

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface CompletionResponse {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
  error?: { message?: string };
}

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

export class OpenAICompatibleClient {
  constructor(private readonly config: OpenAICompatibleConfig) {}

  async respond(prompt: string, context: AssistantToolContext, tools: AssistantTool[], systemPrompt: string): Promise<string> {
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];
    let toolCallsUsed = 0;

    for (;;) {
      const response = await this.complete(messages, tools);
      const message = response.choices?.[0]?.message;
      if (!message) throw new Error(response.error?.message ?? "The AI provider returned no response.");
      const calls = message.tool_calls ?? [];
      if (calls.length === 0) return message.content?.trim() || "I don't have a response for that.";

      messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
      for (const call of calls) {
        toolCallsUsed += 1;
        let result: string;
        if (toolCallsUsed > 3) {
          result = "Tool limit reached. Do not call more tools; explain this to the user.";
        } else {
          const tool = tools.find((candidate) => candidate.name === call.function.name);
          if (!tool) result = `Unknown tool: ${call.function.name}`;
          else {
            try {
              const argumentsValue = JSON.parse(call.function.arguments) as unknown;
              result = await tool.execute(context, argumentsValue);
            } catch (error) {
              result = `Tool failed: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
          }
        }
        const boundedResult = result.length <= MAX_TOOL_RESULT_CHARACTERS
          ? result
          : `${result.slice(0, MAX_TOOL_RESULT_CHARACTERS)}\n[Tool result truncated]`;
        messages.push({ role: "tool", tool_call_id: call.id, content: boundedResult });
      }
      if (toolCallsUsed >= 3) {
        const final = await this.complete(messages, []);
        return final.choices?.[0]?.message?.content?.trim() || "I reached the task limit for this request.";
      }
    }
  }

  private async complete(messages: ChatMessage[], tools: AssistantTool[]): Promise<CompletionResponse> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxOutputTokens,
        ...(tools.length && {
          tools: tools.map((tool) => ({
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: tool.parameters },
          })),
          tool_choice: "auto",
        }),
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    const body = await response.text();
    let parsed: CompletionResponse;
    try { parsed = JSON.parse(body) as CompletionResponse; }
    catch { throw new Error(`The AI provider returned invalid JSON (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(parsed.error?.message ?? `AI provider request failed with HTTP ${response.status}.`);
    return parsed;
  }
}
