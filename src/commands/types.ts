import type {
  ChatInputCommandInteraction,
  Client,
  Interaction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import type { BotStore } from "../store.js";
import type { AssistantTool } from "../assistant/types.js";

export interface CommandContext {
  client: Client;
  store: BotStore;
  assistantTools: AssistantTool[];
  config: {
    timeZone: string;
    movieNightsChannel: string;
    tmdbApiToken: string;
  };
}

export interface CommandModule {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  handleInteraction?(interaction: Interaction): Promise<boolean>;
  onReady?(): Promise<void> | void;
}

export type CommandFactory = (context: CommandContext) => CommandModule;
