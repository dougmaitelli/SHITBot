import * as chrono from "chrono-node";

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function timeZoneOffsetMilliseconds(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const instantWithoutMilliseconds = Math.floor(instant.getTime() / 1000) * 1000;

  return (
    Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second")) -
    instantWithoutMilliseconds
  );
}

function zonedDateTimeToDate(parts: DateTimeParts, timeZone: string): Date {
  const wallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let result = wallClockAsUtc - timeZoneOffsetMilliseconds(timeZone, new Date(wallClockAsUtc));

  // Recalculate at the resulting instant because the first estimate may cross a daylight-saving boundary.
  result = wallClockAsUtc - timeZoneOffsetMilliseconds(timeZone, new Date(result));

  return new Date(result);
}

function explicitOffsetMinutes(input: string): number | null {
  if (/Z\s*$/i.test(input)) return 0;

  const match = /([+-])(\d{2}):(\d{2})\s*$/.exec(input);

  if (!match) return null;

  const [, sign, hours, minutes] = match;
  const offset = Number(hours) * 60 + Number(minutes);

  return sign === "-" ? -offset : offset;
}

export function parseDate(input: string, timeZone: string, now = new Date()): number | null {
  // This also validates the configured IANA timezone and throws a clear RangeError if it is invalid.
  const currentOffsetMinutes = timeZoneOffsetMilliseconds(timeZone, now) / 60_000;
  const result = chrono.parse(input.trim(), { instant: now, timezone: currentOffsetMinutes }, { forwardDate: true })[0];

  if (!result) return null;

  if (!result.start.isCertain("month") || !result.start.isCertain("day") || !result.start.isCertain("hour"))
    return null;

  const numericOffset = explicitOffsetMinutes(input);

  if (numericOffset !== null) {
    const wallClockAsUtc = Date.UTC(
      result.start.get("year")!,
      result.start.get("month")! - 1,
      result.start.get("day")!,
      result.start.get("hour")!,
      result.start.get("minute") ?? 0,
      result.start.get("second") ?? 0,
    );

    return Math.floor((wallClockAsUtc - numericOffset * 60_000) / 1000);
  }

  if (result.start.isCertain("timezoneOffset")) {
    return Math.floor(result.start.date().getTime() / 1000);
  }

  const date = zonedDateTimeToDate(
    {
      year: result.start.get("year")!,
      month: result.start.get("month")!,
      day: result.start.get("day")!,
      hour: result.start.get("hour")!,
      minute: result.start.get("minute") ?? 0,
      second: result.start.get("second") ?? 0,
    },
    timeZone,
  );

  return Math.floor(date.getTime() / 1000);
}

export function parseDateOnly(input: string, timeZone: string, now = new Date()): number | null {
  const currentOffsetMinutes = timeZoneOffsetMilliseconds(timeZone, now) / 60_000;
  const result = chrono.parse(input.trim(), { instant: now, timezone: currentOffsetMinutes }, { forwardDate: true })[0];

  if (!result || !result.start.isCertain("month") || !result.start.isCertain("day")) return null;

  return Math.floor(
    zonedDateTimeToDate(
      {
        year: result.start.get("year")!,
        month: result.start.get("month")!,
        day: result.start.get("day")!,
        hour: 0,
        minute: 0,
        second: 0,
      },
      timeZone,
    ).getTime() / 1000,
  );
}

export function calendarDateToTimestamp(date: string, timeZone: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) throw new Error(`Invalid calendar date: ${date}`);

  const [, year, month, day] = match;

  return Math.floor(
    zonedDateTimeToDate(
      {
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: 0,
        minute: 0,
        second: 0,
      },
      timeZone,
    ).getTime() / 1000,
  );
}

export function timestampToCalendarDate(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp * 1000));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;

  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function parseCalendarDate(input: string, timeZone: string, now = new Date()): string | null {
  const timestamp = parseDateOnly(input, timeZone, now);

  return timestamp === null ? null : timestampToCalendarDate(timestamp, timeZone);
}

export function addCalendarDays(date: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) throw new Error(`Invalid calendar date: ${date}`);

  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));

  return `${shifted.getUTCFullYear().toString().padStart(4, "0")}-${(shifted.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-${shifted.getUTCDate().toString().padStart(2, "0")}`;
}

export function calendarDaysBetween(start: string, end: string): number {
  const value = (date: string) => {
    const [year, month, day] = date.split("-").map(Number);

    if (!year || !month || !day) throw new Error(`Invalid calendar date: ${date}`);

    return Date.UTC(year, month - 1, day);
  };

  return Math.round((value(end) - value(start)) / 86_400_000);
}

export function formatCalendarDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function formatUtcDateTime(timestamp: number): string {
  return new Date(timestamp * 1000)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function parseEventEnd(input: string, timeZone: string, startsAt: number, fullDay: boolean): number | null {
  const eventDate = new Date(startsAt * 1000);

  if (fullDay) return parseDateOnly(input, timeZone, eventDate);

  const parsed = parseDate(input, timeZone, eventDate);

  if (parsed !== null) return parsed;

  return parseTimeOnDate(input, timeZone, startsAt);
}

export function parseTimeOnDate(input: string, timeZone: string, referenceAt: number): number | null {
  const referenceDate = new Date(referenceAt * 1000);
  const currentOffsetMinutes = timeZoneOffsetMilliseconds(timeZone, referenceDate) / 60_000;
  const result = chrono.parse(
    input.trim(),
    { instant: referenceDate, timezone: currentOffsetMinutes },
    { forwardDate: true },
  )[0];

  if (!result || !result.start.isCertain("hour") || result.start.isCertain("month") || result.start.isCertain("day"))
    return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const eventDay = `${value("year")}-${value("month")}-${value("day")}`;

  return parseDate(`${eventDay} ${input}`, timeZone, referenceDate);
}

export function addZonedDays(timestamp: number, timeZone: string, days: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(timestamp * 1000));
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const date = new Date(Date.UTC(value("year"), value("month") - 1, value("day") + days));

  return Math.floor(
    zonedDateTimeToDate(
      {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: 0,
        minute: 0,
        second: 0,
      },
      timeZone,
    ).getTime() / 1000,
  );
}
