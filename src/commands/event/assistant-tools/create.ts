import { objectArguments } from "../../../assistant/tool-utils.js";
import { addZonedDays, parseDate, parseDateOnly, parseEventEnd } from "../../../utils/date-parser.js";
import { createCommunityEvent, parseEventLink } from "../actions/create.js";
import type { EventAssistantToolDependencies } from "./types.js";
import type { AssistantTool } from "../../../assistant/types.js";

interface EventToolArguments {
  name: string;
  when: string;
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

  if (typeof input.when !== "string" || !input.when.trim()) throw new Error("An event date and time are required.");

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
      required: ["name", "when"],
      properties: {
        name: { type: "string", description: "Event name, maximum 100 characters" },
        when: { type: "string", description: `Date and time; defaults to ${timeZone} when no offset is given` },
        description: { type: "string", description: "Optional details, maximum 1000 characters" },
        link: { type: "string", description: "Optional http or https URL" },
        duration_minutes: { type: "integer", minimum: 15, maximum: 10080, description: "Defaults to 180" },
        attendance_limit: { type: "integer", minimum: 1, maximum: 100000 },
        ends: { type: "string", description: "Optional end date/time" },
        full_day: { type: "boolean", description: "Treat this as an all-day event; defaults to false" },
      },
    },
    async execute(context, value) {
      const input = creationArguments(value);
      const startsAt = (input.full_day ? parseDateOnly : parseDate)(input.when, timeZone);

      if (!startsAt) throw new Error("I couldn't understand the event date and time.");

      if (startsAt <= Math.floor(Date.now() / 1000)) throw new Error("The event must be scheduled in the future.");

      const endsAt =
        (input.ends
          ? parseEventEnd(input.ends, timeZone, startsAt, input.full_day ?? false)
          : input.full_day
            ? addZonedDays(startsAt, timeZone, 1)
            : undefined) ?? undefined;

      if (input.ends !== undefined && (!endsAt || endsAt <= startsAt))
        throw new Error("The event end must be after its start.");

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
          startsAt,
          endsAt,
          fullDay: input.full_day ?? false,
          description,
          link,
          attendanceLimit: input.attendance_limit,
          durationMinutes: input.duration_minutes ?? 180,
        },
        (options) => channel.send(options),
      );

      return `Created **${event.name}** for <t:${event.startsAt}:F> in <#${event.channelId}>.`;
    },
  };
}
