import type { Guild } from "discord.js";

export interface AssistantToolContext {
  guild: Guild;
  channelId: string;
  userId: string;
}

export interface AssistantTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(context: AssistantToolContext, argumentsValue: unknown): Promise<string>;
}
