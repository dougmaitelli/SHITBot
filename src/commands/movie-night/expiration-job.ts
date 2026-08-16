import { closeExpired, startExpirationJob as startSharedExpirationJob } from "../../shared/expiration.js";
import type { MovieNight } from "./types.js";
import type { BotStore } from "../../store.js";

type UpdateNightMessage = (night: MovieNight) => Promise<void>;

export async function closeExpiredMovieNights(store: BotStore, updateMessage: UpdateNightMessage): Promise<void> {
  await closeExpired({
    list: () => store.list(),
    save: (night) => store.set(night),
    updateMessage,
    itemName: "movie night",
  });
}

export function startExpirationJob(store: BotStore, updateMessage: UpdateNightMessage): NodeJS.Timeout {
  return startSharedExpirationJob({
    list: () => store.list(),
    save: (night) => store.set(night),
    updateMessage,
    itemName: "movie night",
  });
}
