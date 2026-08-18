import {
  createExternalScheduledEvent,
  deleteScheduledEvent as deleteSharedScheduledEvent,
  editExternalScheduledEvent,
} from "../../shared/scheduled-event.js";
import { eventEndsAt, eventStartsAt } from "./schedule.js";
import type { CommunityEvent } from "./types.js";
import type { Client, Guild } from "discord.js";

function scheduledEventDetails(event: CommunityEvent) {
  const description = [
    event.description,
    `Organized by <@${event.creatorId}>. RSVP in <#${event.channelId}>.`,
    event.link,
  ]
    .filter(Boolean)
    .join("\n\n");
  const startsAt = eventStartsAt(event);
  const endsAt = eventEndsAt(event);

  return {
    name: event.name,
    description,
    startsAt,
    durationMinutes: Math.max(1, Math.round((endsAt - startsAt) / 60)),
    endsAt,
    location: event.link ?? `See <#${event.channelId}>`,
  };
}

export async function createScheduledEvent(guild: Guild, event: CommunityEvent): Promise<string> {
  return createExternalScheduledEvent(guild, scheduledEventDetails(event));
}

export async function updateScheduledEvent(client: Client, event: CommunityEvent): Promise<void> {
  await editExternalScheduledEvent(client, event, scheduledEventDetails(event));
}

export async function deleteScheduledEvent(client: Client, event: CommunityEvent): Promise<void> {
  await deleteSharedScheduledEvent(client, event);
}
