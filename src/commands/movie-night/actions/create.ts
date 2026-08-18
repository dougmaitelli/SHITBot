import { randomUUID } from "node:crypto";
import { renderNight } from "../renderers/night.js";
import { createScheduledEvent, deleteScheduledEvent } from "../scheduled-event.js";
import type { BotStore } from "../../../store.js";
import type { MovieNight } from "../types.js";
import type { Client, Guild } from "discord.js";

export interface CreateMovieNightInput {
  guild: Guild;
  channelId: string;
  creatorId: string;
  startsAt: number;
  location: string;
  movie: string | null;
  attendanceLimit?: number;
  durationMinutes: number;
}

type SendNightMessage = (
  options: ReturnType<typeof renderNight>,
) => Promise<{ id: string; delete(): Promise<unknown> }>;

export async function createMovieNight(
  client: Client,
  store: BotStore,
  input: CreateMovieNightInput,
  sendMessage: SendNightMessage,
): Promise<MovieNight> {
  const night: MovieNight = {
    id: randomUUID().slice(0, 8),
    guildId: input.guild.id,
    channelId: input.channelId,
    messageId: "",
    creatorId: input.creatorId,
    startsAt: input.startsAt,
    durationMinutes: input.durationMinutes,
    location: input.location,
    movie: input.movie,
    votingOpen: input.movie === null,
    attendanceLimit: input.attendanceLimit,
    rsvps: {},
    suggestions: [],
    createdAt: Date.now(),
  };

  night.scheduledEventId = await createScheduledEvent(input.guild, night, input.durationMinutes);
  let message: Awaited<ReturnType<SendNightMessage>> | undefined;

  try {
    message = await sendMessage(renderNight(night));
    night.messageId = message.id;
    await store.set(night);

    return night;
  } catch (error) {
    await message?.delete().catch(() => undefined);
    await deleteScheduledEvent(client, night).catch(() => undefined);
    throw error;
  }
}
