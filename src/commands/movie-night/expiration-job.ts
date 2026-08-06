import type { BotStore } from "../../store.js";
import type { MovieNight } from "./types.js";

const EXPIRATION_CHECK_INTERVAL_MS = 30_000;

type UpdateNightMessage = (night: MovieNight) => Promise<void>;

export async function closeExpiredMovieNights(store: BotStore, updateMessage: UpdateNightMessage): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expired = store.list().filter((night) => !night.closedAt && night.startsAt <= now);

  for (const night of expired) {
    night.closedAt = Date.now();
    await store.set(night);
    await updateMessage(night).catch((error) =>
      console.error(`Could not update closed movie night ${night.id}`, error),
    );
  }
}

export function startExpirationJob(store: BotStore, updateMessage: UpdateNightMessage): NodeJS.Timeout {
  const run = () =>
    void closeExpiredMovieNights(store, updateMessage).catch((error) =>
      console.error("Could not close expired movie nights", error),
    );

  run();
  return setInterval(run, EXPIRATION_CHECK_INTERVAL_MS);
}
