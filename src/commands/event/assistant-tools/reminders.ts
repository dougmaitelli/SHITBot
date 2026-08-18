import { createReminder, parseReminderArguments } from "../../../assistant/reminder-tool.js";
import { objectArguments } from "../../../assistant/tool-utils.js";
import type { EventAssistantToolDependencies } from "./types.js";
import type { AssistantTool } from "../../../assistant/types.js";

export function createEventReminderTool({
  client,
  store,
  timeZone,
  roles,
  visible,
}: EventAssistantToolDependencies): AssistantTool {
  return {
    name: "create_event_reminder",
    description:
      "Post or schedule an organizer-or-moderator reminder for an upcoming Discord Scheduled Event. Omit when to post now.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["event_id"],
      properties: {
        event_id: { type: "string", description: "Stable ID returned by list_upcoming_events" },
        when: { type: "string", description: `Optional future date/time; defaults to ${timeZone} without an offset` },
        message: { type: "string", description: "Optional note, maximum 1000 characters" },
      },
    },
    async execute(context, value) {
      const input = objectArguments(value);

      if (typeof input.event_id !== "string") throw new Error("event_id is required.");

      const found = (await visible(context)).find(({ item }) => item.ref === input.event_id);

      if (!found) throw new Error("That upcoming Discord event could not be found.");

      return createReminder(client, store, context, found.item, parseReminderArguments(input), timeZone, roles);
    },
  };
}
