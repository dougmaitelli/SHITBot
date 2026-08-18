import { attendance } from "../../../assistant/event-data.js";
import { itemSummary, objectArguments } from "../../../assistant/tool-utils.js";
import type { VisibleEvents } from "./types.js";
import type { AssistantTool } from "../../../assistant/types.js";

export function createEventAttendanceTool(visible: VisibleEvents): AssistantTool {
  return {
    name: "get_event_attendance",
    description:
      "Get attendance for one Discord Scheduled Event. Bot-created events include RSVP breakdowns; other events include Discord's Interested count.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["event_id"],
      properties: {
        event_id: { type: "string", description: "Stable ID returned by list_upcoming_events" },
      },
    },
    async execute(context, value) {
      const input = objectArguments(value);

      if (typeof input.event_id !== "string") throw new Error("event_id is required.");

      const found = (await visible(context)).find(({ item }) => item.ref === input.event_id);

      if (!found) throw new Error("That upcoming Discord event could not be found.");

      return JSON.stringify({ event: itemSummary(found.item), attendance: attendance(found.item) });
    },
  };
}
