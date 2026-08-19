import { eventEndsAt } from "./commands/event/schedule.js";
import { logger } from "./logger.js";
import type { BotStore } from "./store.js";

export const EXPIRED_RECORD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function deleteExpiredRecords(
  store: BotStore,
  now = Date.now(),
): Promise<{
  events: number;
  movieNights: number;
}> {
  const cutoff = Math.floor((now - EXPIRED_RECORD_RETENTION_MS) / 1000);
  const events = store.listEvents().filter((event) => eventEndsAt(event) <= cutoff);
  const movieNights = store.list().filter((night) => night.startsAt <= cutoff);

  for (const event of events) await store.deleteEvent(event.id);

  for (const night of movieNights) await store.delete(night.id);

  return { events: events.length, movieNights: movieNights.length };
}

export function startCleanupJob(store: BotStore): NodeJS.Timeout {
  const run = () =>
    void deleteExpiredRecords(store)
      .then(({ events, movieNights }) => {
        if (events || movieNights) logger.info("Deleted expired records", { events, movieNights });
      })
      .catch((error) => logger.error("Could not delete expired records", { error }));

  return setInterval(run, CLEANUP_INTERVAL_MS);
}
