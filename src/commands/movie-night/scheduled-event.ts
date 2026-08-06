import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  type Client,
  type Guild,
} from "discord.js";
import type { MovieNight } from "./types.js";

function eventName(night: MovieNight): string {
  return (night.movie ? `Movie Night: ${night.movie}` : "Movie Night: Movie TBD").slice(0, 100);
}

export async function createScheduledEvent(
  guild: Guild,
  night: MovieNight,
  durationMinutes: number,
): Promise<string> {
  const startTime = night.startsAt * 1000;
  const event = await guild.scheduledEvents.create({
    name: eventName(night),
    description: `Organized by <@${night.creatorId}>. RSVP and vote in <#${night.channelId}>.`,
    scheduledStartTime: startTime,
    scheduledEndTime: startTime + durationMinutes * 60_000,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location: night.location.slice(0, 100) },
  });
  return event.id;
}

export async function updateScheduledEventMovie(client: Client, night: MovieNight): Promise<void> {
  if (!night.scheduledEventId) return;
  const guild = await client.guilds.fetch(night.guildId);
  await guild.scheduledEvents.edit(night.scheduledEventId, { name: eventName(night) });
}

export async function deleteScheduledEvent(client: Client, night: MovieNight): Promise<void> {
  if (!night.scheduledEventId) return;
  const guild = await client.guilds.fetch(night.guildId);
  await guild.scheduledEvents.delete(night.scheduledEventId);
}
