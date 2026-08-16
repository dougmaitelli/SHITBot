import { randomUUID } from "node:crypto";
import { renderEvent } from "./event-render.js";
import { createScheduledEvent, deleteScheduledEvent } from "./scheduled-event.js";
import type { CommunityEvent } from "./types.js";
import type { BotStore } from "../../store.js";
import type { Client, Guild, GuildScheduledEvent } from "discord.js";

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
}

export interface AdoptCommunityEventInput {
  guildId: string;
  channelId: string;
  creatorId: string;
  attendanceLimit?: number;
}

export function parseEventLink(value: string | undefined): string | undefined {
  const link = value?.trim() || undefined;
  if (!link) return undefined;
  const url = new URL(link);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported URL protocol");
  return link;
}

export function parseScheduledEventReference(value: string, guildId: string): string {
  const reference = value.trim();
  if (/^\d{15,22}$/.test(reference)) return reference;
  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    throw new Error("Invalid Discord event reference");
  }
  if (url.protocol !== "https:" || !/(?:^|\.)discord\.com$/i.test(url.hostname)) {
    throw new Error("Invalid Discord event host");
  }
  const [, kind, referencedGuildId, eventId] = url.pathname.split("/");
  if (kind !== "events" || referencedGuildId !== guildId || !eventId || !/^\d{15,22}$/.test(eventId)) {
    throw new Error("Invalid Discord event URL");
  }
  return eventId;
}

type SendEventMessage = (
  options: ReturnType<typeof renderEvent>,
) => Promise<{ id: string; delete(): Promise<unknown> }>;

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

export async function adoptCommunityEvent(
  store: BotStore,
  input: AdoptCommunityEventInput,
  scheduledEvent: GuildScheduledEvent,
  sendMessage: SendEventMessage,
): Promise<CommunityEvent> {
  if (!scheduledEvent.scheduledStartTimestamp) throw new Error("The Discord event has no start time.");
  const event: CommunityEvent = {
    id: randomUUID().slice(0, 8),
    guildId: input.guildId,
    channelId: input.channelId,
    messageId: "",
    scheduledEventId: scheduledEvent.id,
    creatorId: input.creatorId,
    name: scheduledEvent.name,
    startsAt: Math.floor(scheduledEvent.scheduledStartTimestamp / 1000),
    description: scheduledEvent.description ?? undefined,
    attendanceLimit: input.attendanceLimit,
    rsvps: {},
    createdAt: Date.now(),
  };
  let message: Awaited<ReturnType<SendEventMessage>> | undefined;
  try {
    message = await sendMessage(renderEvent(event));
    event.messageId = message.id;
    await store.setEvent(event);
    return event;
  } catch (error) {
    await message?.delete().catch(() => undefined);
    throw error;
  }
}
