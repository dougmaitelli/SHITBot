import { randomUUID } from "node:crypto";
import { renderEvent } from "../renderers/event.js";
import type { ManagedMessage } from "../../../shared/managed-message.js";
import type { BotStore } from "../../../store.js";
import type { CommunityEvent } from "../types.js";
import type { GuildScheduledEvent } from "discord.js";

export interface AdoptCommunityEventInput {
  guildId: string;
  channelId: string;
  importedById: string;
  attendanceLimit?: number;
}

type SendEventMessage = (options: ReturnType<typeof renderEvent>) => Promise<ManagedMessage>;

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
    creatorId: scheduledEvent.creatorId ?? input.importedById,
    name: scheduledEvent.name,
    schedule: {
      type: "timed",
      startsAt: Math.floor(scheduledEvent.scheduledStartTimestamp / 1000),
      endsAt: scheduledEvent.scheduledEndTimestamp
        ? Math.floor(scheduledEvent.scheduledEndTimestamp / 1000)
        : Math.floor(scheduledEvent.scheduledStartTimestamp / 1000) + 180 * 60,
    },
    description: scheduledEvent.description ?? undefined,
    attendanceLimit: input.attendanceLimit,
    rsvps: {},
    createdAt: Date.now(),
  };
  let message: Awaited<ReturnType<SendEventMessage>> | undefined;

  try {
    message = await sendMessage(renderEvent(event));
    event.messageId = message.id;
    await message.pin();
    await store.setEvent(event);

    return event;
  } catch (error) {
    await message?.delete().catch(() => undefined);
    throw error;
  }
}
