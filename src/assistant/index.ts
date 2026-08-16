import { Events, type Client, type Message } from "discord.js";
import { FixedWindowRateLimiter } from "./rate-limiter.js";
import { OpenAICompatibleClient, type OpenAICompatibleConfig } from "./openai-client.js";
import type { AssistantTool } from "./types.js";

export interface AssistantConfig extends OpenAICompatibleConfig {
  maxInputCharacters: number;
  userRequestsPerWindow: number;
  guildRequestsPerWindow: number;
  rateLimitWindowMs: number;
  timeZone: string;
}

function promptFromMention(message: Message, botId: string): string {
  return message.content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
}

function visibleReply(value: string): string {
  return value.length <= 1900 ? value : `${value.slice(0, 1897)}...`;
}

export function startAssistant(client: Client, tools: AssistantTool[], config: AssistantConfig): void {
  const api = new OpenAICompatibleClient(config);
  const users = new FixedWindowRateLimiter(config.userRequestsPerWindow, config.rateLimitWindowMs);
  const guilds = new FixedWindowRateLimiter(config.guildRequestsPerWindow, config.rateLimitWindowMs);
  const activeUsers = new Set<string>();

  client.on(Events.MessageCreate, async (message) => {
    if (!client.user || message.author.bot || !message.inGuild() || !message.mentions.users.has(client.user.id)) return;
    const prompt = promptFromMention(message, client.user.id);
    const reply = (content: string) => message.reply({ content, allowedMentions: { parse: [], repliedUser: false } });
    if (!prompt) { await reply("What would you like me to do?"); return; }
    if (prompt.length > config.maxInputCharacters) {
      await reply(`That request is too long. Please keep it under ${config.maxInputCharacters.toLocaleString()} characters.`);
      return;
    }
    if (activeUsers.has(message.author.id)) { await reply("I'm already working on your previous request."); return; }

    const userLimit = users.consume(`${message.guildId}:${message.author.id}`);
    if (!userLimit.allowed) {
      await reply(`I'm receiving too many requests. Try again in ${Math.max(1, Math.ceil(userLimit.retryAfterMs / 60_000))} minute(s).`);
      return;
    }
    const guildLimit = guilds.consume(message.guildId);
    if (!guildLimit.allowed) {
      await reply(`I'm receiving too many requests. Try again in ${Math.max(1, Math.ceil(guildLimit.retryAfterMs / 60_000))} minute(s).`);
      return;
    }

    activeUsers.add(message.author.id);
    try {
      await message.channel.sendTyping();
      const response = await api.respond(prompt, {
        guild: message.guild, channelId: message.channelId, userId: message.author.id,
      }, tools, [
        "You are a concise Discord community assistant.",
        "Use tools only when the user explicitly asks to create or schedule something. Never invent missing required details.",
        "Do not claim an action succeeded unless its tool result says it succeeded.",
        `The configured timezone is ${config.timeZone}. The current time is ${new Date().toISOString()}.`,
      ].join(" "));
      await reply(visibleReply(response));
    } catch (error) {
      console.error("Assistant request failed", error);
      await reply("I couldn't complete that request right now.");
    } finally {
      activeUsers.delete(message.author.id);
    }
  });
}
