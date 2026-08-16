import {
  createExternalScheduledEvent,
  deleteScheduledEvent as deleteSharedScheduledEvent,
} from "../../shared/scheduled-event.js";
import type { CommunityEvent } from "./types.js";
import type { Client, Guild } from "discord.js";

export async function createScheduledEvent(
  guild: Guild,
  event: CommunityEvent,
  durationMinutes: number,
): Promise<string> {
  const description = [
    event.description,
    `Organized by <@${event.creatorId}>. RSVP in <#${event.channelId}>.`,
    event.link,
  ]
    .filter(Boolean)
    .join("\n\n");
  return createExternalScheduledEvent(guild, {
    name: event.name,
    description,
    startsAt: event.startsAt,
    durationMinutes,
    location: event.link ?? `See <#${event.channelId}>`,
  });
}

export async function deleteScheduledEvent(client: Client, event: CommunityEvent): Promise<void> {
  await deleteSharedScheduledEvent(client, event);
}
