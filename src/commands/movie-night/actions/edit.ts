import { updateScheduledEvent } from "../scheduled-event.js";
import type { BotStore } from "../../../store.js";
import type { MovieNightMessageService } from "../messages.js";
import type { MovieNight } from "../types.js";
import type { Client } from "discord.js";

export type MovieNightEdits = Partial<
  Pick<MovieNight, "startsAt" | "location" | "movie" | "votingOpen" | "durationMinutes" | "attendanceLimit">
>;

export async function editMovieNight(
  client: Client,
  store: BotStore,
  messages: MovieNightMessageService,
  night: MovieNight,
  edits: MovieNightEdits,
): Promise<MovieNight> {
  const updated = { ...night, ...edits };

  await updateScheduledEvent(client, updated);
  await store.set(updated);
  await messages.updateAll(updated);

  return updated;
}
