import { randomUUID } from "node:crypto";
import { eventCalendarAttachment } from "../../../shared/calendar.js";
import { renderEvent } from "../renderers/event.js";
import { createScheduledEvent, deleteScheduledEvent } from "../scheduled-event.js";
import type { ManagedMessage } from "../../../shared/managed-message.js";
import type { BotStore } from "../../../store.js";
import type { CommunityEvent, EventSchedule } from "../types.js";
import type { AttachmentPayload, Client, Guild } from "discord.js";

export interface CreateCommunityEventInput {
  guild: Guild;
  channelId: string;
  creatorId: string;
  name: string;
  schedule: EventSchedule;
  description?: string;
  link?: string;
  attendanceLimit?: number;
}

type SendEventMessage = (
  options: ReturnType<typeof renderEvent> & { files?: AttachmentPayload[] },
) => Promise<ManagedMessage>;

export function parseEventLink(value: string | undefined): string | undefined {
  const link = value?.trim() || undefined;

  if (!link) return undefined;

  const url = new URL(link);

  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported URL protocol");

  return link;
}

export async function createCommunityEvent(
  client: Client,
  store: BotStore,
  input: CreateCommunityEventInput,
  sendMessage: SendEventMessage,
): Promise<CommunityEvent> {
  const event: CommunityEvent = {
    id: randomUUID().slice(0, 8),
    guildId: input.guild.id,
    channelId: input.channelId,
    messageId: "",
    creatorId: input.creatorId,
    name: input.name,
    schedule: input.schedule,
    description: input.description,
    link: input.link,
    attendanceLimit: input.attendanceLimit,
    rsvps: {},
    createdAt: Date.now(),
  };

  event.scheduledEventId = await createScheduledEvent(input.guild, event);
  let message: Awaited<ReturnType<SendEventMessage>> | undefined;

  try {
    message = await sendMessage({ ...renderEvent(event), files: [eventCalendarAttachment(event)] });
    event.messageId = message.id;
    await message.pin();
    await store.setEvent(event);

    return event;
  } catch (error) {
    await message?.delete().catch(() => undefined);
    await deleteScheduledEvent(client, event).catch(() => undefined);
    throw error;
  }
}
