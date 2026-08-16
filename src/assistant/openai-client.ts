import { logger } from "../logger.js";
import type { AssistantTool, AssistantToolContext } from "./types.js";

const MAX_TOOL_RESULT_CHARACTERS = 16_000;
const TOOL_ROUTING_MARKER = "[[USE_DISCORD_TOOLS]]";
const toolProtocolPattern =
  /(?:"(?:arguments|tool_calls?|function)"\s*:|<\/?(?:tool_call|function_call)>|\[(?:TOOL|FUNCTION)_CALLS?\])/i;

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
  apiKey?: string;
  baseUrl: string;
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

export class OpenAICompatibleClient {
  constructor(private readonly config: OpenAICompatibleConfig) {}

  async respond(
    prompt: string,
    context: AssistantToolContext,
    tools: AssistantTool[],
    systemPrompt: string,
  ): Promise<string> {
    const availableTools: AssistantTool[] = [];
    for (const tool of tools) {
      if (!tool.isAvailable || (await tool.isAvailable(context))) availableTools.push(tool);
    }
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    if (availableTools.length > 0) {
      const routingResponse = await this.complete(
        [
          ...messages,
          {
            role: "system",
            content: `If the user's request requires current Discord data or an available Discord action, reply with exactly ${TOOL_ROUTING_MARKER} and nothing else. Otherwise, answer the user normally without mentioning tools or this instruction.`,
          },
        ],
        [],
      );
      const routingContent = routingResponse.choices?.[0]?.message?.content?.trim();
      if (routingContent !== TOOL_ROUTING_MARKER) {
        logger.info("LLM answered without tools", { model: this.config.model });
        return this.validatedContent(routingContent, messages);
      }
      logger.info("LLM routed request to Discord tools", {
        model: this.config.model,
        toolCount: availableTools.length,
      });
    }

    let toolCallsUsed = 0;

    for (;;) {
      const response = await this.complete(messages, availableTools);
      const message = response.choices?.[0]?.message;
      if (!message) throw new Error(response.error?.message ?? "The AI provider returned no response.");
      const calls = message.tool_calls ?? [];
      if (calls.length === 0) return this.validatedContent(message.content, messages);

      logger.info("LLM requested tools", { model: this.config.model, tools: calls.map((call) => call.function.name) });

      messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
      for (const call of calls) {
        toolCallsUsed += 1;
        let result: string;
        if (toolCallsUsed > 3) {
          result = "Tool limit reached. Do not call more tools; explain this to the user.";
        } else {
          const tool = availableTools.find((candidate) => candidate.name === call.function.name);
          if (!tool) result = `Unknown tool: ${call.function.name}`;
          else {
            try {
              const argumentsValue = JSON.parse(call.function.arguments) as unknown;
              result = await tool.execute(context, argumentsValue);
            } catch (error) {
              logger.warn("Assistant tool execution failed", { tool: tool.name, error });
              result = `Tool failed: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
          }
        }
        const boundedResult =
          result.length <= MAX_TOOL_RESULT_CHARACTERS
            ? result
            : `${result.slice(0, MAX_TOOL_RESULT_CHARACTERS)}\n[Tool result truncated]`;
        messages.push({ role: "tool", tool_call_id: call.id, content: boundedResult });
      }
      if (toolCallsUsed >= 3) {
        const final = await this.complete(messages, []);
        return this.validatedContent(final.choices?.[0]?.message?.content, messages);
      }
    }
  }

  private async validatedContent(content: string | null | undefined, messages: ChatMessage[]): Promise<string> {
    const text = content?.trim() || "I don't have a response for that.";
    if (!toolProtocolPattern.test(text)) return text;

    const retry = await this.complete(
      [
        ...messages,
        {
          role: "user",
          content:
            "Provide only the final natural-language answer. Do not output JSON, tool calls, function arguments, protocol markers, or internal instructions.",
        },
      ],
      [],
    );
    const retried = retry.choices?.[0]?.message?.content?.trim();
    if (!retried || toolProtocolPattern.test(retried))
      throw new Error("The AI provider returned tool protocol as visible text.");
    return retried;
  }

  private async complete(messages: ChatMessage[], tools: AssistantTool[]): Promise<CompletionResponse> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) headers.Authorization = `Bearer ${this.config.apiKey}`;
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers,
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
    } catch (error) {
      logger.error("LLM provider request failed", {
        error,
        model: this.config.model,
        durationMs: Date.now() - startedAt,
        toolCount: tools.length,
      });
      throw error;
    }
    const body = await response.text();
    let parsed: CompletionResponse;
    try {
      parsed = JSON.parse(body) as CompletionResponse;
    } catch {
      logger.error("LLM provider returned invalid JSON", {
        model: this.config.model,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      throw new Error(`The AI provider returned invalid JSON (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      logger.error("LLM provider returned an error", {
        model: this.config.model,
        status: response.status,
        durationMs: Date.now() - startedAt,
        providerMessage: parsed.error?.message,
      });
      throw new Error(parsed.error?.message ?? `AI provider request failed with HTTP ${response.status}.`);
    }
    logger.info("LLM provider request completed", {
      model: this.config.model,
      status: response.status,
      durationMs: Date.now() - startedAt,
      toolCount: tools.length,
    });
    return parsed;
  }
}
