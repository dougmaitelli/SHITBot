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
  return Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second")) - instantWithoutMilliseconds;
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

export function parseMovieNightDate(input: string, timeZone: string, now = new Date()): number | null {
  // This also validates the configured IANA timezone and throws a clear RangeError if it is invalid.
  const currentOffsetMinutes = timeZoneOffsetMilliseconds(timeZone, now) / 60_000;
  const result = chrono.parse(input.trim(), { instant: now, timezone: currentOffsetMinutes }, { forwardDate: true })[0];
  if (!result) return null;
  if (!result.start.isCertain("month") || !result.start.isCertain("day") || !result.start.isCertain("hour")) return null;

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
