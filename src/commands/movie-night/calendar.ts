import { googleCalendarUrl } from "../../shared/google-calendar.js";
import { formatUtcDateTime } from "../../utils/date-parser.js";
import type { MovieNight } from "./types.js";

export function movieNightCalendarUrl(night: MovieNight): string {
  const title = night.movie ? `Movie Night: ${night.movie}` : "Movie Night";
  const duration = night.durationMinutes ?? 180;
  const discordUrl = night.scheduledEventId
    ? `https://discord.com/events/${night.guildId}/${night.scheduledEventId}`
    : undefined;

  return googleCalendarUrl({
    title,
    dates: `${formatUtcDateTime(night.startsAt)}/${formatUtcDateTime(night.startsAt + duration * 60)}`,
    details: discordUrl ? `Discord event: ${discordUrl}` : undefined,
    location: night.location,
  });
}
