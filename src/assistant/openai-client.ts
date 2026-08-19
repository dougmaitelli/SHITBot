import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, jsonSchema, stepCountIs, tool, type ModelMessage, type ToolSet } from "ai";
import { logger } from "../logger.js";
import type { AssistantTool, AssistantToolContext } from "./types.js";

const MAX_TOOL_RESULT_CHARACTERS = 16_000;
const MAX_TOOL_CALLS = 20;
const toolProtocolPattern =
  /(?:"(?:arguments|tool_calls?|function)"\s*:|<\/?(?:tool_call|function_call)>|\[(?:TOOL|FUNCTION)_CALLS?\])/i;

export interface OpenAICompatibleConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

function boundedToolResult(result: string): string {
  return result.length <= MAX_TOOL_RESULT_CHARACTERS
    ? result
    : `${result.slice(0, MAX_TOOL_RESULT_CHARACTERS)}\n[Tool result truncated]`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exposesToolProtocol(text: string, toolNames: string[]): boolean {
  if (toolProtocolPattern.test(text)) return true;

  if (toolNames.length === 0) return false;

  // Some models print a Python-like pseudo-call instead of using the provider's
  // native tool-call field. It was not executed, so never expose it as success.
  return new RegExp(`(?:^|\\s)(?:${toolNames.map(escapeRegExp).join("|")})\\s*\\(`, "i").test(text);
}

export class OpenAICompatibleClient {
  private readonly model;

  constructor(private readonly config: OpenAICompatibleConfig) {
    const provider = createOpenAICompatible({
      name: "configured-provider",
      baseURL: config.baseUrl.replace(/\/$/, ""),
      ...(config.apiKey && { apiKey: config.apiKey }),
    });

    this.model = provider(config.model);
  }

  async respond(
    prompt: string,
    context: AssistantToolContext,
    tools: AssistantTool[],
    systemPrompt: string,
  ): Promise<string> {
    const availableTools: AssistantTool[] = [];

    for (const candidate of tools) {
      if (!candidate.isAvailable || (await candidate.isAvailable(context))) availableTools.push(candidate);
    }

    let toolCallsUsed = 0;
    const sdkTools: ToolSet = Object.fromEntries(
      availableTools.map((candidate) => [
        candidate.name,
        tool({
          description: candidate.description,
          inputSchema: jsonSchema(candidate.parameters),
          async execute(input: unknown) {
            toolCallsUsed += 1;

            if (toolCallsUsed > MAX_TOOL_CALLS)
              return "Tool limit reached. Do not call more tools; explain this to the user.";

            try {
              return boundedToolResult(await candidate.execute(context, input));
            } catch (error) {
              logger.warn("Assistant tool execution failed", { tool: candidate.name, error });

              return `Tool failed: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
          },
          toModelOutput: ({ output }) => ({ type: "text", value: String(output) }),
        }),
      ]),
    );
    const startedAt = Date.now();
    const modelName = this.config.model;
    const result = await generateText({
      model: this.model,
      system: systemPrompt,
      prompt,
      tools: sdkTools,
      stopWhen: [stepCountIs(MAX_TOOL_CALLS), () => toolCallsUsed >= MAX_TOOL_CALLS],
      maxOutputTokens: this.config.maxOutputTokens,
      abortSignal: AbortSignal.timeout(this.config.timeoutMs),
      onStepEnd({ toolCalls }) {
        if (toolCalls.length > 0)
          logger.info("LLM requested tools", {
            model: modelName,
            tools: toolCalls.map((call) => call.toolName),
          });
      },
    });

    logger.info("LLM provider request completed", {
      model: this.config.model,
      durationMs: Date.now() - startedAt,
      stepCount: result.steps.length,
      toolCallCount: result.toolCalls.length,
    });

    let text = result.text.trim();

    if (!text && toolCallsUsed >= MAX_TOOL_CALLS) {
      const final = await generateText({
        model: this.model,
        system: `${systemPrompt} The tool limit has been reached. Provide a concise final answer without calling tools.`,
        messages: [{ role: "user", content: prompt }, ...result.responseMessages] as ModelMessage[],
        maxOutputTokens: this.config.maxOutputTokens,
        abortSignal: AbortSignal.timeout(this.config.timeoutMs),
      });

      text = final.text.trim();
    }

    text ||= "I don't have a response for that.";
    const toolNames = availableTools.map(({ name }) => name);

    if (exposesToolProtocol(text, toolNames)) {
      const retry = await generateText({
        model: this.model,
        system: `${systemPrompt} The preceding assistant text contained tool protocol or a pseudo-call that was not executed. Provide only a natural-language answer, do not call tools, and do not claim that any unexecuted action succeeded.`,
        messages: [{ role: "user", content: prompt }, ...result.responseMessages] as ModelMessage[],
        maxOutputTokens: this.config.maxOutputTokens,
        abortSignal: AbortSignal.timeout(this.config.timeoutMs),
      });

      text = retry.text.trim();

      if (!text || exposesToolProtocol(text, toolNames))
        throw new Error("The AI provider returned an unexecuted tool call as visible text.");
    }

    return text;
  }
}
