import { randomUUID } from "node:crypto";
import { renderEvent } from "../renderers/event.js";
import { createScheduledEvent, deleteScheduledEvent } from "../scheduled-event.js";
import type { BotStore } from "../../../store.js";
import type { CommunityEvent } from "../types.js";
import type { Client, Guild } from "discord.js";

export interface CreateCommunityEventInput {
  guild: Guild;
  channelId: string;
  creatorId: string;
  name: string;
  startsAt: number;
  description?: string;
  link?: string;
  attendanceLimit?: number;
  durationMinutes: number;
  endsAt?: number;
  fullDay?: boolean;
}

type SendEventMessage = (
  options: ReturnType<typeof renderEvent>,
) => Promise<{ id: string; delete(): Promise<unknown> }>;

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
    startsAt: input.startsAt,
    durationMinutes: input.durationMinutes,
    endsAt: input.endsAt,
    fullDay: input.fullDay,
    description: input.description,
    link: input.link,
    attendanceLimit: input.attendanceLimit,
    rsvps: {},
    createdAt: Date.now(),
  };

  event.scheduledEventId = await createScheduledEvent(input.guild, event, input.durationMinutes);
  let message: Awaited<ReturnType<SendEventMessage>> | undefined;

  try {
    message = await sendMessage(renderEvent(event));
    event.messageId = message.id;
    await store.setEvent(event);

    return event;
  } catch (error) {
    await message?.delete().catch(() => undefined);
    await deleteScheduledEvent(client, event).catch(() => undefined);
    throw error;
  }
}
