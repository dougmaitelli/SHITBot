import type { AssistantTool } from "../assistant/types.js";
import type { RoleConfig } from "../authorization.js";
import type { BotStore } from "../store.js";
import type {
  ChatInputCommandInteraction,
  Client,
  Interaction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  SendableChannels,
} from "discord.js";

export type GuildCommandInteraction = ChatInputCommandInteraction<"cached"> & {
  channel: SendableChannels;
  channelId: string;
};

export interface CommandContext {
  client: Client;
  store: BotStore;
  assistantTools: AssistantTool[];
  config: {
    timeZone: string;
    movieNightsChannel: string;
    tmdbApiToken: string;
    roles: RoleConfig;
  };
}

export interface CommandModule {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute(interaction: GuildCommandInteraction): Promise<void>;
  handleInteraction?(interaction: Interaction): Promise<boolean>;
  onReady?(): Promise<void> | void;
}

export type CommandFactory = (context: CommandContext) => CommandModule;
