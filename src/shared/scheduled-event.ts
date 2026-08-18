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
  endsAt?: number;
}

type ScheduledEventChanges = Partial<Pick<ScheduledEventDetails, "name" | "description" | "location">> &
  (
    | Pick<ScheduledEventDetails, "startsAt" | "durationMinutes" | "endsAt">
    | { startsAt?: never; durationMinutes?: never; endsAt?: never }
  );

export async function createExternalScheduledEvent(guild: Guild, details: ScheduledEventDetails): Promise<string> {
  const startTime = details.startsAt * 1000;
  const event = await guild.scheduledEvents.create({
    name: details.name.slice(0, 100),
    description: details.description.slice(0, 1000),
    scheduledStartTime: startTime,
    scheduledEndTime: details.endsAt ? details.endsAt * 1000 : startTime + details.durationMinutes * 60_000,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location: details.location.slice(0, 100) },
  });

  return event.id;
}

export async function editExternalScheduledEvent(
  client: Client,
  reference: ScheduledEventReference,
  changes: ScheduledEventChanges,
): Promise<void> {
  if (!reference.scheduledEventId) return;

  const guild = await client.guilds.fetch(reference.guildId);

  await guild.scheduledEvents.edit(reference.scheduledEventId, {
    ...(changes.name !== undefined && { name: changes.name.slice(0, 100) }),
    ...(changes.description !== undefined && { description: changes.description.slice(0, 1000) }),
    ...(changes.startsAt !== undefined && {
      scheduledStartTime: changes.startsAt * 1000,
      scheduledEndTime:
        changes.endsAt !== undefined
          ? changes.endsAt * 1000
          : changes.startsAt * 1000 + changes.durationMinutes * 60_000,
    }),
    ...(changes.location !== undefined && { entityMetadata: { location: changes.location.slice(0, 100) } }),
  });
}

export async function deleteScheduledEvent(client: Client, reference: ScheduledEventReference): Promise<void> {
  if (!reference.scheduledEventId) return;

  const guild = await client.guilds.fetch(reference.guildId);

  await guild.scheduledEvents.delete(reference.scheduledEventId);
}
