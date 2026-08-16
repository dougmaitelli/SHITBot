import { attendance, type UpcomingItem } from "./event-data.js";

export function objectArguments(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Arguments must be an object.");
  return value as Record<string, unknown>;
}

export function requestedLimit(value: unknown): number {
  if (value === undefined) return 10;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 25)
    throw new Error("Limit must be from 1 to 25.");
  return value as number;
}

export function itemSummary(item: UpcomingItem, userId?: string) {
  const counts = attendance(item);
  return {
    id: item.ref,
    type: item.kind,
    title: item.title,
    discord_time: `<t:${item.startsAt}:F>`,
    channel: `<#${item.channelId}>`,
    organizer: `<@${item.creatorId}>`,
    details: item.details?.slice(0, 300) ?? null,
    going: counts.goingCount,
    maybe: counts.maybeCount,
    not_going: counts.notGoingCount,
    attendance_limit: counts.attendanceLimit,
    spots_available: counts.spotsAvailable,
    discord_interested: counts.discordInterestedCount,
    event_url: item.url ?? null,
    user_status: userId ? (item.rsvps[userId] ?? null) : undefined,
  };
}
