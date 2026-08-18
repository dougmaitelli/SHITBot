import { objectArguments } from "../../../assistant/tool-utils.js";
import { isOrganizerOrModerator } from "../../../authorization.js";
import { addZonedDays, parseDate, parseDateOnly, parseEventEnd } from "../../../utils/date-parser.js";
import { parseEventLink } from "../actions/create.js";
import { editCommunityEvent } from "../actions/edit.js";
import type { EventAssistantToolDependencies } from "./types.js";
import type { AssistantTool } from "../../../assistant/types.js";

export function createEventEditTool({
  client,
  store,
  timeZone,
  roles,
  messages,
}: EventAssistantToolDependencies): AssistantTool {
  return {
    name: "edit_event",
    description:
      "Edit exactly one future bot-managed non-movie event by its stable ID. If the user identifies one or more events by name instead of ID, call list_upcoming_events first, select only the exact intended managed event IDs from those results, and call edit_event once per ID. Only the organizer or a moderator may edit it.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["event_id"],
      properties: {
        event_id: { type: "string", description: "Stable ID returned by list_upcoming_events, such as event:abcd1234" },
        name: { type: "string", description: "New event name, maximum 100 characters" },
        when: { type: "string", description: `New date and time; defaults to ${timeZone} without an offset` },
        description: { type: "string", description: "New details; empty text clears them" },
        link: { type: "string", description: "New http/https URL; empty text clears it" },
        duration_minutes: { type: "integer", minimum: 15, maximum: 10080 },
        attendance_limit: { type: "integer", minimum: 1, maximum: 100000 },
        ends: { type: "string", description: "New end date/time" },
        full_day: { type: "boolean", description: "Whether this is an all-day event" },
      },
    },
    async execute(context, value) {
      const input = objectArguments(value);

      if (typeof input.event_id !== "string") throw new Error("event_id is required.");

      const event = store.getEvent(input.event_id.replace(/^event:/, ""));

      if (!event || event.guildId !== context.guild.id) throw new Error("That managed event could not be found.");

      if (event.closedAt || event.startsAt <= Math.floor(Date.now() / 1000))
        throw new Error("That event has started and is no longer editable.");

      if (!(await isOrganizerOrModerator(context.guild, context.userId, event.creatorId, roles)))
        throw new Error("Only the event organizer or a moderator can edit it.");

      const editable = [
        "name",
        "when",
        "description",
        "link",
        "duration_minutes",
        "attendance_limit",
        "ends",
        "full_day",
      ];

      if (!editable.some((key) => input[key] !== undefined)) throw new Error("Provide at least one field to edit.");

      if (
        input.name !== undefined &&
        (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 100)
      )
        throw new Error("The event name must be from 1 to 100 characters.");

      if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > 1000))
        throw new Error("Description must be text with at most 1000 characters.");

      if (input.when !== undefined && typeof input.when !== "string") throw new Error("when must be text.");

      if (input.link !== undefined && typeof input.link !== "string") throw new Error("Link must be text.");

      if (input.ends !== undefined && typeof input.ends !== "string") throw new Error("End must be text.");

      if (input.full_day !== undefined && typeof input.full_day !== "boolean")
        throw new Error("full_day must be true or false.");

      if (input.ends !== undefined && input.duration_minutes !== undefined)
        throw new Error("Use either ends or duration_minutes, not both.");

      if (
        input.duration_minutes !== undefined &&
        (!Number.isInteger(input.duration_minutes) ||
          (input.duration_minutes as number) < 15 ||
          (input.duration_minutes as number) > 10080)
      )
        throw new Error("Duration must be from 15 to 10080 minutes.");

      if (
        input.attendance_limit !== undefined &&
        (!Number.isInteger(input.attendance_limit) ||
          (input.attendance_limit as number) < 1 ||
          (input.attendance_limit as number) > 100000)
      )
        throw new Error("Attendance limit must be from 1 to 100000.");

      const fullDay = input.full_day ?? event.fullDay ?? false;
      const startsAt =
        input.when === undefined
          ? input.full_day === true && !event.fullDay
            ? addZonedDays(event.startsAt, timeZone, 0)
            : event.startsAt
          : (fullDay ? parseDateOnly : parseDate)(input.when, timeZone);

      if (!startsAt || startsAt <= Math.floor(Date.now() / 1000))
        throw new Error("Provide a valid future date and time.");

      const previousDuration = event.endsAt ? event.endsAt - event.startsAt : (event.durationMinutes ?? 180) * 60;
      const endsAt =
        input.ends !== undefined
          ? parseEventEnd(input.ends, timeZone, startsAt, fullDay)
          : input.duration_minutes !== undefined
            ? startsAt + (input.duration_minutes as number) * 60
            : input.when !== undefined
              ? startsAt + previousDuration
              : input.full_day === true && !event.fullDay
                ? addZonedDays(startsAt, timeZone, 1)
                : event.endsAt;

      if (endsAt !== undefined && (!endsAt || endsAt <= startsAt))
        throw new Error("The event end must be after its start.");

      let link = event.link;

      try {
        if (input.link !== undefined) link = parseEventLink(input.link);
      } catch {
        throw new Error("The event link must be a valid http or https URL.");
      }
      const updated = await editCommunityEvent(client, store, messages, event, {
        name: input.name === undefined ? event.name : input.name.trim(),
        startsAt,
        endsAt,
        fullDay,
        description: input.description === undefined ? event.description : input.description.trim() || undefined,
        link,
        durationMinutes: (input.duration_minutes as number | undefined) ?? event.durationMinutes ?? 180,
        attendanceLimit: (input.attendance_limit as number | undefined) ?? event.attendanceLimit,
      });

      return `Updated **${updated.name}** for <t:${updated.startsAt}:F>.`;
    },
  };
}
