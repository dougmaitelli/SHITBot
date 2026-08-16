import type { BotStore } from "../store.js";
import type { Rsvps } from "../shared/rsvp.js";

export interface UpcomingItem {
  ref: string;
  kind: "event" | "movie-night";
  guildId: string;
  channelId: string;
  messageId: string;
  creatorId: string;
  title: string;
  startsAt: number;
  details?: string;
  attendanceLimit?: number;
  rsvps: Rsvps;
  url?: string;
  discordInterestedCount?: number;
}

export function upcomingItems(store: BotStore, guildId: string, now = Math.floor(Date.now() / 1000)): UpcomingItem[] {
  const events: UpcomingItem[] = store.listEvents()
    .filter((event) => event.guildId === guildId && !event.closedAt && event.startsAt > now)
    .map((event) => ({
      ref: `event:${event.id}`, kind: "event", guildId: event.guildId, channelId: event.channelId,
      messageId: event.messageId, creatorId: event.creatorId, title: event.name, startsAt: event.startsAt,
      details: event.description, attendanceLimit: event.attendanceLimit, rsvps: event.rsvps,
    }));
  const nights: UpcomingItem[] = store.list()
    .filter((night) => night.guildId === guildId && !night.closedAt && night.startsAt > now)
    .map((night) => ({
      ref: `movie-night:${night.id}`, kind: "movie-night", guildId: night.guildId, channelId: night.channelId,
      messageId: night.messageId, creatorId: night.creatorId,
      title: night.movie ? `Movie Night: ${night.movie}` : "Movie Night: Movie TBD", startsAt: night.startsAt,
      details: `Location: ${night.location}`, attendanceLimit: night.attendanceLimit, rsvps: night.rsvps,
    }));
  return [...events, ...nights].sort((left, right) => left.startsAt - right.startsAt);
}

export function findUpcomingItem(store: BotStore, guildId: string, ref: string): UpcomingItem | undefined {
  return upcomingItems(store, guildId).find((item) => item.ref === ref);
}

export function attendance(item: UpcomingItem) {
  const users = (status: "yes" | "maybe" | "no") => Object.entries(item.rsvps)
    .filter(([, value]) => value === status).map(([id]) => `<@${id}>`);
  const going = users("yes");
  const maybe = users("maybe");
  const notGoing = users("no");
  return {
    goingCount: going.length, maybeCount: maybe.length, notGoingCount: notGoing.length,
    going: going.slice(0, 50), maybe: maybe.slice(0, 50), notGoing: notGoing.slice(0, 50),
    attendeeListsTruncated: going.length > 50 || maybe.length > 50 || notGoing.length > 50,
    discordInterestedCount: item.discordInterestedCount ?? null,
    attendanceLimit: item.attendanceLimit ?? null,
    spotsAvailable: item.attendanceLimit === undefined ? null : Math.max(0, item.attendanceLimit - going.length),
  };
}
