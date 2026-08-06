import type { Client } from "discord.js";
import type { BotStore } from "../../store.js";
import { createScheduledEvent, deleteScheduledEvent } from "./scheduled-event.js";
import type { MovieNight } from "./types.js";

const MIGRATED_EVENT_DURATION_MINUTES = 180;

type UpdateNightMessage = (night: MovieNight) => Promise<void>;

// TODO: Remove this migration after all pre-Scheduled-Event movie nights have expired or been migrated.
export async function migrateExistingMovieNightsToScheduledEvents(
  client: Client,
  store: BotStore,
  updateMessage: UpdateNightMessage,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const upcomingNights = store.list().filter((night) => !night.closedAt && night.startsAt > now);

  for (const night of upcomingNights) {
    try {
      if (!night.scheduledEventId) {
        const guild = await client.guilds.fetch(night.guildId);
        night.scheduledEventId = await createScheduledEvent(guild, night, MIGRATED_EVENT_DURATION_MINUTES);
        try {
          await store.set(night);
        } catch (error) {
          await deleteScheduledEvent(client, night).catch(() => undefined);
          night.scheduledEventId = undefined;
          throw error;
        }
        console.log(`Migrated movie night ${night.id} to scheduled event ${night.scheduledEventId}`);
      }

      // Refresh on every startup so a previous message-update failure is retried without duplicating the event.
      await updateMessage(night);
    } catch (error) {
      console.error(`Could not migrate movie night ${night.id} to a scheduled event`, error);
    }
  }
}
