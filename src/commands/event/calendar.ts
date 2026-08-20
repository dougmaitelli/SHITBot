import { googleCalendarUrl } from "../../shared/google-calendar.js";
import { addCalendarDays, formatUtcDateTime } from "../../utils/date-parser.js";
import type { CommunityEvent } from "./types.js";

function calendarDate(value: string): string {
  return value.replaceAll("-", "");
}

export function eventCalendarUrl(event: CommunityEvent): string {
  const discordUrl = event.scheduledEventId
    ? `https://discord.com/events/${event.guildId}/${event.scheduledEventId}`
    : undefined;
  const details = [event.description, discordUrl].filter(Boolean).join("\n\n");
  const dates =
    event.schedule.type === "timed"
      ? `${formatUtcDateTime(event.schedule.startsAt)}/${formatUtcDateTime(event.schedule.endsAt)}`
      : `${calendarDate(event.schedule.startsOn)}/${calendarDate(addCalendarDays(event.schedule.endsOn, 1))}`;

  return googleCalendarUrl({ title: event.name, dates, details: details || undefined });
}
