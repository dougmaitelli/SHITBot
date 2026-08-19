import { formatCalendarDate } from "../utils/date-parser.js";
import { attendance, type UpcomingItem } from "./event-data.js";

export function objectArguments(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Arguments must be an object.");

  return value as Record<string, unknown>;
}

export function requestedLimit(value: unknown): number {
  if (value === undefined) return 10;

  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 50)
    throw new Error("Limit must be from 1 to 50.");

  return value as number;
}

export function actionValidationFailure(options: {
  resourceType: "event" | "movie-night";
  resourceId: string;
  resourceName: string;
  timeZone: string;
  error: unknown;
}): string {
  return JSON.stringify({
    success: false,
    resource_found: true,
    resource_type: options.resourceType,
    resource_id: options.resourceId,
    resource_name: options.resourceName,
    configured_timezone: options.timeZone,
    error: options.error instanceof Error ? options.error.message : String(options.error),
    instruction: "Report this validation error exactly. Do not say the resource or ID was missing.",
  });
}

export function itemSummary(item: UpcomingItem, userId?: string) {
  const counts = attendance(item);
  const discordTime = item.allDay
    ? item.allDay.startsOn === item.allDay.endsOn
      ? `${formatCalendarDate(item.allDay.startsOn)} (all day)`
      : `${formatCalendarDate(item.allDay.startsOn)} – ${formatCalendarDate(item.allDay.endsOn)} (all day)`
    : item.endsAt
      ? `<t:${item.startsAt}:F> – <t:${item.endsAt}:F>`
      : `<t:${item.startsAt}:F>`;

  return {
    id: item.ref,
    type: item.kind,
    title: item.title,
    discord_time: discordTime,
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
