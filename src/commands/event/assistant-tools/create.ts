import { objectArguments } from "../../../assistant/tool-utils.js";
import { createCommunityEvent, parseEventLink } from "../actions/create.js";
import { createEventSchedule, formatEventSchedule, scheduleEndsAt, scheduleStartsAt } from "../schedule.js";
import type { EventAssistantToolDependencies } from "./types.js";
import type { AssistantTool } from "../../../assistant/types.js";

interface EventToolArguments {
  name: string;
  starts: string;
  description?: string;
  link?: string;
  duration_minutes?: number;
  attendance_limit?: number;
  ends?: string;
  full_day?: boolean;
}

function creationArguments(value: unknown): EventToolArguments {
  const input = objectArguments(value);

  if (typeof input.name !== "string" || !input.name.trim()) throw new Error("An event name is required.");

  if (typeof input.starts !== "string" || !input.starts.trim()) throw new Error("An event start is required.");

  if (input.description !== undefined && typeof input.description !== "string")
    throw new Error("Description must be text.");

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

  return input as unknown as EventToolArguments;
}

export function createEventCreationTool({ client, store, timeZone }: EventAssistantToolDependencies): AssistantTool {
  return {
    name: "create_event",
    description: "Create a non-movie event in the current Discord channel. Use only when explicitly requested.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["name", "starts"],
      properties: {
        name: { type: "string", description: "Event name, maximum 100 characters" },
        starts: {
          type: "string",
          description: `Start date/time, or first all-day date; defaults to ${timeZone} without an offset`,
        },
        description: { type: "string", description: "Optional details, maximum 1000 characters" },
        link: { type: "string", description: "Optional http or https URL" },
        duration_minutes: { type: "integer", minimum: 15, maximum: 10080, description: "Defaults to 180" },
        attendance_limit: { type: "integer", minimum: 1, maximum: 100000 },
        ends: {
          type: "string",
          description: `End date/time or last inclusive all-day date; values without an offset use ${timeZone}`,
        },
        full_day: { type: "boolean", description: "Optional override; date-only starts are all-day automatically" },
      },
    },
    async execute(context, value) {
      const input = creationArguments(value);
      const schedule = createEventSchedule(
        {
          starts: input.starts,
          ends: input.ends,
          fullDay: input.full_day,
          durationMinutes: input.duration_minutes,
        },
        timeZone,
      );
      const now = Math.floor(Date.now() / 1000);

      if (scheduleEndsAt(schedule) <= now || (schedule.type === "timed" && scheduleStartsAt(schedule) <= now))
        throw new Error("The event must be scheduled in the future.");

      const name = input.name.trim();

      if (name.length > 100) throw new Error("The event name must be at most 100 characters.");

      const description = input.description?.trim() || undefined;

      if (description && description.length > 1000) throw new Error("The description must be at most 1000 characters.");

      let link: string | undefined;

      try {
        link = parseEventLink(input.link);
      } catch {
        throw new Error("The event link must be a valid http or https URL.");
      }
      const channel = await client.channels.fetch(context.channelId);

      if (!channel?.isTextBased() || !channel.isSendable()) throw new Error("I can't send an event in this channel.");

      const event = await createCommunityEvent(
        client,
        store,
        {
          guild: context.guild,
          channelId: context.channelId,
          creatorId: context.userId,
          name,
          schedule,
          description,
          link,
          attendanceLimit: input.attendance_limit,
        },
        (options) => channel.send(options),
      );

      return `Created **${event.name}** for ${formatEventSchedule(event.schedule)} in <#${event.channelId}>.`;
    },
  };
}
