import { addCalendarDays } from "../utils/date-parser.js";
import type { CommunityEvent } from "../commands/event/types.js";
import type { MovieNight } from "../commands/movie-night/types.js";
import type { AttachmentPayload } from "discord.js";

function escapeText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function utcDateTime(timestamp: number): string {
  return new Date(timestamp * 1000)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function calendarDate(value: string): string {
  return value.replaceAll("-", "");
}

function foldLine(line: string): string[] {
  const folded: string[] = [];
  let current = "";
  let limit = 75;

  for (const character of line) {
    if (Buffer.byteLength(current + character, "utf8") > limit) {
      folded.push(current);
      current = ` ${character}`;
      limit = 75;
    } else {
      current += character;
    }
  }

  folded.push(current);

  return folded;
}

function calendarFile(lines: string[]): Buffer {
  return Buffer.from(lines.flatMap(foldLine).join("\r\n") + "\r\n", "utf8");
}

function filename(title: string, id: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 64);

  return `${slug || "event"}-${id}.ics`;
}

function discordEventUrl(guildId: string, scheduledEventId: string | undefined): string | undefined {
  return scheduledEventId ? `https://discord.com/events/${guildId}/${scheduledEventId}` : undefined;
}

function attachment(name: string, content: Buffer): AttachmentPayload {
  return { attachment: content, name, description: "Add this event to your calendar" };
}

export function eventCalendarAttachment(event: CommunityEvent): AttachmentPayload {
  const url = event.link ?? discordEventUrl(event.guildId, event.scheduledEventId);
  const description = [event.description, discordEventUrl(event.guildId, event.scheduledEventId)]
    .filter(Boolean)
    .join("\n\n");
  const schedule =
    event.schedule.type === "timed"
      ? [`DTSTART:${utcDateTime(event.schedule.startsAt)}`, `DTEND:${utcDateTime(event.schedule.endsAt)}`]
      : [
          `DTSTART;VALUE=DATE:${calendarDate(event.schedule.startsOn)}`,
          `DTEND;VALUE=DATE:${calendarDate(addCalendarDays(event.schedule.endsOn, 1))}`,
        ];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SHITBot//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${event.guildId}-${event.id}@shitbot`,
    `DTSTAMP:${utcDateTime(Math.floor(event.createdAt / 1000))}`,
    ...schedule,
    `SUMMARY:${escapeText(event.name)}`,
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    ...(url ? [`URL:${url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return attachment(filename(event.name, event.id), calendarFile(lines));
}

export function movieNightCalendarAttachment(night: MovieNight): AttachmentPayload {
  const title = night.movie ? `Movie Night: ${night.movie}` : "Movie Night";
  const url = discordEventUrl(night.guildId, night.scheduledEventId);
  const duration = night.durationMinutes ?? 180;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SHITBot//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:movie-night-${night.guildId}-${night.id}@shitbot`,
    `DTSTAMP:${utcDateTime(Math.floor(night.createdAt / 1000))}`,
    `DTSTART:${utcDateTime(night.startsAt)}`,
    `DTEND:${utcDateTime(night.startsAt + duration * 60)}`,
    `SUMMARY:${escapeText(title)}`,
    `LOCATION:${escapeText(night.location)}`,
    ...(url ? [`DESCRIPTION:${escapeText(`Discord event: ${url}`)}`, `URL:${url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return attachment(filename(title, night.id), calendarFile(lines));
}
