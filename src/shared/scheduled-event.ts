import { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, type Client, type Guild } from "discord.js";

export interface ScheduledEventReference {
  guildId: string;
  scheduledEventId?: string;
}

interface ScheduledEventDetails {
  name: string;
  description: string;
  location: string;
  startsAt: number;
  durationMinutes: number;
}

export async function createExternalScheduledEvent(guild: Guild, details: ScheduledEventDetails): Promise<string> {
  const startTime = details.startsAt * 1000;
  const event = await guild.scheduledEvents.create({
    name: details.name.slice(0, 100),
    description: details.description.slice(0, 1000),
    scheduledStartTime: startTime,
    scheduledEndTime: startTime + details.durationMinutes * 60_000,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location: details.location.slice(0, 100) },
  });

  return event.id;
}

export async function renameScheduledEvent(
  client: Client,
  reference: ScheduledEventReference,
  name: string,
): Promise<void> {
  if (!reference.scheduledEventId) return;

  const guild = await client.guilds.fetch(reference.guildId);

  await guild.scheduledEvents.edit(reference.scheduledEventId, { name: name.slice(0, 100) });
}

export async function deleteScheduledEvent(client: Client, reference: ScheduledEventReference): Promise<void> {
  if (!reference.scheduledEventId) return;

  const guild = await client.guilds.fetch(reference.guildId);

  await guild.scheduledEvents.delete(reference.scheduledEventId);
}
