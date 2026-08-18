import type { UpcomingItem } from "../../../assistant/event-data.js";
import type { AssistantToolContext } from "../../../assistant/types.js";
import type { RoleConfig } from "../../../authorization.js";
import type { BotStore } from "../../../store.js";
import type { EventMessageService } from "../messages.js";
import type { Client, GuildScheduledEvent } from "discord.js";

export interface VisibleEvent {
  item: UpcomingItem;
  scheduled: GuildScheduledEvent;
}

export type VisibleEvents = (context: AssistantToolContext) => Promise<VisibleEvent[]>;

export interface EventAssistantToolDependencies {
  client: Client;
  store: BotStore;
  timeZone: string;
  roles: RoleConfig;
  messages: EventMessageService;
  visible: VisibleEvents;
}
