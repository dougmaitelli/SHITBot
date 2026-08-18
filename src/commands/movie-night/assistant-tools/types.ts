import type { UpcomingItem } from "../../../assistant/event-data.js";
import type { AssistantToolContext } from "../../../assistant/types.js";
import type { RoleConfig } from "../../../authorization.js";
import type { BotStore } from "../../../store.js";
import type { MovieNightMessageService } from "../messages.js";
import type { TmdbClient } from "../tmdb.js";
import type { Client } from "discord.js";

export type RequireMovieChannel = (channelId: string) => Promise<unknown>;
export type MovieNightToolAvailability = (context: AssistantToolContext) => Promise<boolean>;

export interface MovieNightAssistantToolDependencies {
  client: Client;
  store: BotStore;
  timeZone: string;
  requireMovieChannel: RequireMovieChannel;
  channelName: string;
  tmdb?: TmdbClient;
  roles: RoleConfig;
  messages: MovieNightMessageService;
  nights: (guildId: string) => UpcomingItem[];
  availableInMovieChannel: MovieNightToolAvailability;
}
