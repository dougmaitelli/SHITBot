import { actionValidationFailure, objectArguments } from "../../../assistant/tool-utils.js";
import { isOrganizerOrModerator } from "../../../authorization.js";
import { logger } from "../../../logger.js";
import { parseEventLink } from "../actions/create.js";
import { editCommunityEvent } from "../actions/edit.js";
import { editEventSchedule, formatEventSchedule, isEventEnded, scheduleEndsAt, scheduleStartsAt } from "../schedule.js";
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
      "Edit exactly one future bot-managed non-movie event by its stable ID. If the user identifies one or more events by name instead of ID, call list_upcoming_events first, match only against each result's title field and never its details, select only the exact intended managed event IDs, and call edit_event once per ID. Only the organizer or a moderator may edit it.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["event_id"],
      properties: {
        event_id: { type: "string", description: "Stable ID returned by list_upcoming_events, such as event:abcd1234" },
        name: { type: "string", description: "New event name, maximum 100 characters" },
        starts: {
          type: "string",
          description: `New start date/time or first all-day date. Pass the user's value unchanged; values without an offset use ${timeZone}, and a time by itself stays on the event's current date`,
        },
        description: { type: "string", description: "New details; empty text clears them" },
        link: { type: "string", description: "New http/https URL; empty text clears it" },
        duration_minutes: { type: "integer", minimum: 15, maximum: 10080 },
        attendance_limit: { type: "integer", minimum: 1, maximum: 100000 },
        ends: {
          type: "string",
          description: `New end date/time or last inclusive all-day date. Pass the user's value unchanged; values without an offset use ${timeZone}, and a time by itself stays on the event's current date`,
        },
        full_day: { type: "boolean", description: "Optional override; date-only starts are all-day automatically" },
      },
    },
    async execute(context, value) {
      const input = objectArguments(value);

      if (typeof input.event_id !== "string") throw new Error("event_id is required.");

      const event = store.getEvent(input.event_id.replace(/^event:/, ""));

      if (!event || event.guildId !== context.guild.id) throw new Error("That managed event could not be found.");

      if (isEventEnded(event)) throw new Error("That event has ended and is no longer editable.");

      if (!(await isOrganizerOrModerator(context.guild, context.userId, event.creatorId, roles)))
        throw new Error("Only the event organizer or a moderator can edit it.");

      const editable = [
        "name",
        "starts",
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

      if (input.starts !== undefined && typeof input.starts !== "string") throw new Error("starts must be text.");

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

      let schedule;

      try {
        schedule = editEventSchedule(
          event.schedule,
          {
            starts: input.starts,
            ends: input.ends,
            fullDay: input.full_day,
            durationMinutes: input.duration_minutes as number | undefined,
          },
          timeZone,
        );
      } catch (error) {
        logger.warn("Assistant event edit schedule validation failed", {
          eventId: event.id,
          timeZone,
          eventStartsAt: scheduleStartsAt(event.schedule),
          updatesStart: input.starts !== undefined,
          updatesEnd: input.ends !== undefined,
          error,
        });

        return actionValidationFailure({
          resourceType: "event",
          resourceId: input.event_id,
          resourceName: event.name,
          timeZone,
          error,
        });
      }
      const now = Math.floor(Date.now() / 1000);

      if (
        scheduleEndsAt(schedule) <= now ||
        (input.starts !== undefined && schedule.type === "timed" && scheduleStartsAt(schedule) <= now)
      )
        return actionValidationFailure({
          resourceType: "event",
          resourceId: input.event_id,
          resourceName: event.name,
          timeZone,
          error: new Error("Provide an event schedule that has not ended."),
        });

      let link = event.link;

      try {
        if (input.link !== undefined) link = parseEventLink(input.link);
      } catch {
        throw new Error("The event link must be a valid http or https URL.");
      }
      const updated = await editCommunityEvent(client, store, messages, event, {
        name: input.name === undefined ? event.name : input.name.trim(),
        schedule,
        description: input.description === undefined ? event.description : input.description.trim() || undefined,
        link,
        attendanceLimit: (input.attendance_limit as number | undefined) ?? event.attendanceLimit,
      });

      return `Updated **${updated.name}** for ${formatEventSchedule(updated.schedule)}.`;
    },
  };
}
