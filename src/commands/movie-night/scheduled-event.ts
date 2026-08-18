import {
  createExternalScheduledEvent,
  deleteScheduledEvent as deleteSharedScheduledEvent,
  editExternalScheduledEvent,
} from "../../shared/scheduled-event.js";
import type { MovieNight } from "./types.js";
import type { Client, Guild } from "discord.js";

function eventName(night: MovieNight): string {
  return (night.movie ? `Movie Night: ${night.movie}` : "Movie Night: Movie TBD").slice(0, 100);
}

export async function createScheduledEvent(guild: Guild, night: MovieNight, durationMinutes: number): Promise<string> {
  return createExternalScheduledEvent(guild, {
    name: eventName(night),
    description: `Organized by <@${night.creatorId}>. RSVP and vote in <#${night.channelId}>.`,
    startsAt: night.startsAt,
    durationMinutes,
    location: night.location,
  });
}

export async function updateScheduledEventMovie(client: Client, night: MovieNight): Promise<void> {
  await editExternalScheduledEvent(client, night, { name: eventName(night) });
}

export async function updateScheduledEvent(client: Client, night: MovieNight): Promise<void> {
  await editExternalScheduledEvent(client, night, {
    name: eventName(night),
    description: `Organized by <@${night.creatorId}>. RSVP and vote in <#${night.channelId}>.`,
    startsAt: night.startsAt,
    durationMinutes: night.durationMinutes ?? 180,
    location: night.location,
  });
}

export async function deleteScheduledEvent(client: Client, night: MovieNight): Promise<void> {
  await deleteSharedScheduledEvent(client, night);
}
