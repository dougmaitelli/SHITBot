import {
  addCalendarDays,
  calendarDateToTimestamp,
  calendarDaysBetween,
  formatCalendarDate,
  parseCalendarDate,
  parseDate,
  parseEventEnd,
  timestampToCalendarDate,
} from "../../utils/date-parser.js";
import type { CommunityEvent, EventSchedule } from "./types.js";

export interface LegacyCommunityEvent extends Omit<CommunityEvent, "schedule"> {
  schedule?: undefined;
  startsAt: number;
  durationMinutes?: number;
  endsAt?: number;
  fullDay?: boolean;
}

export type PersistedCommunityEvent = CommunityEvent | LegacyCommunityEvent;

export interface EventScheduleInput {
  starts?: string;
  ends?: string;
  fullDay?: boolean;
  durationMinutes?: number;
}

export function scheduleStartsAt(schedule: EventSchedule): number {
  return schedule.type === "timed" ? schedule.startsAt : calendarDateToTimestamp(schedule.startsOn, schedule.timeZone);
}

export function scheduleEndsAt(schedule: EventSchedule): number {
  return schedule.type === "timed"
    ? schedule.endsAt
    : calendarDateToTimestamp(addCalendarDays(schedule.endsOn, 1), schedule.timeZone);
}

export function eventStartsAt(event: CommunityEvent): number {
  return scheduleStartsAt(event.schedule);
}

export function eventEndsAt(event: CommunityEvent): number {
  return scheduleEndsAt(event.schedule);
}

export function formatEventSchedule(schedule: EventSchedule): string {
  if (schedule.type === "timed") {
    return `<t:${schedule.startsAt}:F> – <t:${schedule.endsAt}:F>`;
  }

  const start = formatCalendarDate(schedule.startsOn);
  const end = formatCalendarDate(schedule.endsOn);

  return schedule.startsOn === schedule.endsOn ? `${start} (all day)` : `${start} – ${end} (all day)`;
}

export function isEventStarted(event: CommunityEvent, now = Math.floor(Date.now() / 1000)): boolean {
  return eventStartsAt(event) <= now;
}

export function isEventEnded(event: CommunityEvent, now = Math.floor(Date.now() / 1000)): boolean {
  return Boolean(event.closedAt) || eventEndsAt(event) <= now;
}

export function createEventSchedule(
  input: EventScheduleInput & { starts: string },
  timeZone: string,
  now = new Date(),
): EventSchedule {
  if (input.ends !== undefined && input.durationMinutes !== undefined)
    throw new Error("Use either an end or a duration, not both.");

  const parsedStartsAt = parseDate(input.starts, timeZone, now);
  const fullDay = input.fullDay ?? parsedStartsAt === null;

  if (fullDay) {
    if (input.durationMinutes !== undefined) throw new Error("All-day events use an end date, not a duration.");

    const startsOn = parseCalendarDate(input.starts, timeZone, now);

    if (!startsOn) throw new Error("Provide a valid event start date.");

    const startTimestamp = calendarDateToTimestamp(startsOn, timeZone);
    const endsOn = input.ends ? parseCalendarDate(input.ends, timeZone, new Date(startTimestamp * 1000)) : startsOn;

    if (!endsOn || endsOn < startsOn) throw new Error("The event end date must be on or after its start date.");

    return { type: "all-day", startsOn, endsOn, timeZone };
  }

  const startsAt = parsedStartsAt;

  if (!startsAt) throw new Error("Provide a valid event start date and time.");

  const endsAt = input.ends
    ? parseEventEnd(input.ends, timeZone, startsAt, false)
    : startsAt + (input.durationMinutes ?? 180) * 60;

  if (!endsAt || endsAt <= startsAt) throw new Error("The event end must be after its start.");

  return { type: "timed", startsAt, endsAt };
}

export function editEventSchedule(current: EventSchedule, input: EventScheduleInput, timeZone: string): EventSchedule {
  if (input.ends !== undefined && input.durationMinutes !== undefined)
    throw new Error("Use either an end or a duration, not both.");

  const currentStartsAt = scheduleStartsAt(current);
  const parsedStartsAt = input.starts ? parseDate(input.starts, timeZone, new Date(currentStartsAt * 1000)) : null;
  const fullDay = input.fullDay ?? (input.starts ? parsedStartsAt === null : current.type === "all-day");

  if (fullDay) {
    if (input.durationMinutes !== undefined) throw new Error("All-day events use an end date, not a duration.");

    const allDayTimeZone = current.type === "all-day" ? current.timeZone : timeZone;
    const currentStartsOn =
      current.type === "all-day" ? current.startsOn : timestampToCalendarDate(current.startsAt, allDayTimeZone);
    const currentSpan = current.type === "all-day" ? calendarDaysBetween(current.startsOn, current.endsOn) : 0;
    const startsOn = input.starts
      ? parseCalendarDate(
          input.starts,
          allDayTimeZone,
          new Date(calendarDateToTimestamp(currentStartsOn, allDayTimeZone) * 1000),
        )
      : currentStartsOn;

    if (!startsOn) throw new Error("Provide a valid event start date.");

    const endsOn = input.ends
      ? parseCalendarDate(
          input.ends,
          allDayTimeZone,
          new Date(calendarDateToTimestamp(startsOn, allDayTimeZone) * 1000),
        )
      : input.starts
        ? addCalendarDays(startsOn, currentSpan)
        : current.type === "all-day"
          ? current.endsOn
          : startsOn;

    if (!endsOn || endsOn < startsOn) throw new Error("The event end date must be on or after its start date.");

    return {
      type: "all-day",
      startsOn,
      endsOn,
      timeZone: allDayTimeZone,
    };
  }

  const currentDuration = current.type === "timed" ? current.endsAt - current.startsAt : 180 * 60;
  const startsAt = input.starts ? parsedStartsAt : currentStartsAt;

  if (!startsAt) throw new Error("Provide a valid event start date and time.");

  const endsAt = input.ends
    ? parseEventEnd(input.ends, timeZone, startsAt, false)
    : input.durationMinutes !== undefined
      ? startsAt + input.durationMinutes * 60
      : startsAt + currentDuration;

  if (!endsAt || endsAt <= startsAt) throw new Error("The event end must be after its start.");

  return { type: "timed", startsAt, endsAt };
}

export function normalizeCommunityEvent(event: PersistedCommunityEvent, timeZone: string): CommunityEvent {
  if (event.schedule) return event;

  const { startsAt, endsAt, durationMinutes, fullDay, ...rest } = event;
  let schedule: EventSchedule;

  if (fullDay) {
    const startsOn = timestampToCalendarDate(startsAt, timeZone);
    const exclusiveEnd = endsAt ?? calendarDateToTimestamp(addCalendarDays(startsOn, 1), timeZone);
    const endsOn = timestampToCalendarDate(exclusiveEnd - 1, timeZone);

    schedule = { type: "all-day", startsOn, endsOn, timeZone };
  } else {
    schedule = {
      type: "timed",
      startsAt,
      endsAt: endsAt ?? startsAt + (durationMinutes ?? 180) * 60,
    };
  }

  const migrated = { ...rest, schedule };

  if (migrated.closedAt && eventEndsAt(migrated) > Math.floor(Date.now() / 1000)) delete migrated.closedAt;

  return migrated;
}
