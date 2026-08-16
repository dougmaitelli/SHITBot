import type { BotStore } from "../../store.js";
import { closeExpired, startExpirationJob as startSharedExpirationJob } from "../../shared/expiration.js";
import type { CommunityEvent } from "./types.js";

type UpdateMessage = (event: CommunityEvent) => Promise<void>;

export async function closeExpiredEvents(store: BotStore, updateMessage: UpdateMessage): Promise<void> {
  await closeExpired({ list: () => store.listEvents(), save: (event) => store.setEvent(event), updateMessage, itemName: "event" });
}

export function startExpirationJob(store: BotStore, updateMessage: UpdateMessage): NodeJS.Timeout {
  return startSharedExpirationJob({ list: () => store.listEvents(), save: (event) => store.setEvent(event), updateMessage, itemName: "event" });
}
