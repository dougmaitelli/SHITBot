import { closeExpired, startExpirationJob as startSharedExpirationJob } from "../../shared/expiration.js";
import { eventEndsAt } from "./schedule.js";
import type { CommunityEvent } from "./types.js";
import type { BotStore } from "../../store.js";

type UpdateMessage = (event: CommunityEvent) => Promise<void>;

export async function closeExpiredEvents(store: BotStore, updateMessage: UpdateMessage): Promise<void> {
  await closeExpired({
    list: () => store.listEvents(),
    save: (event) => store.setEvent(event),
    updateMessage,
    expiresAt: eventEndsAt,
    itemName: "event",
  });
}

export function startExpirationJob(store: BotStore, updateMessage: UpdateMessage): NodeJS.Timeout {
  return startSharedExpirationJob({
    list: () => store.listEvents(),
    save: (event) => store.setEvent(event),
    updateMessage,
    expiresAt: eventEndsAt,
    itemName: "event",
  });
}
