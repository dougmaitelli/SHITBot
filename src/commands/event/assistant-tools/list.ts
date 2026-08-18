import { itemSummary, objectArguments, requestedLimit } from "../../../assistant/tool-utils.js";
import type { VisibleEvents } from "./types.js";
import type { UpcomingItem } from "../../../assistant/event-data.js";
import type { AssistantTool } from "../../../assistant/types.js";
import type { GuildScheduledEvent } from "discord.js";

async function isInterested(event: GuildScheduledEvent, userId: string): Promise<boolean> {
  const after = (BigInt(userId) - 1n).toString();
  const subscribers = await event.fetchSubscribers({ after, limit: 1 });

  return subscribers.has(userId);
}

export function createEventListTools(visible: VisibleEvents): AssistantTool[] {
  return [
    {
      name: "list_upcoming_events",
      description:
        "List all upcoming Discord Scheduled Events in this server, including events created manually or by other bots. This is server-wide and is not filtered by the requesting user's attendance; do not use it for requests about events I, me, or my am attending.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 25, description: "Defaults to 10" },
        },
      },
      async execute(context, value) {
        const input = objectArguments(value);
        const items = (await visible(context)).slice(0, requestedLimit(input.limit));

        return JSON.stringify({
          scope: "server-wide",
          requesting_user_filtered: false,
          instruction: "These are all server events, not events the requesting user is attending.",
          events: items.map(({ item }) => itemSummary(item)),
          total_returned: items.length,
        });
      },
    },
    {
      name: "list_my_upcoming_events",
      description:
        "List upcoming Discord Scheduled Events the requesting user marked Interested in, plus bot events where they RSVP'd Going. Use this for requests about events I, me, or my am attending. Address the requester as you, never as I or the bot. Can include bot Maybe responses.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          include_maybe: { type: "boolean", description: "Include bot-managed Maybe RSVPs; defaults to false" },
          limit: { type: "integer", minimum: 1, maximum: 25, description: "Defaults to 10" },
        },
      },
      async execute(context, value) {
        const input = objectArguments(value);

        if (input.include_maybe !== undefined && typeof input.include_maybe !== "boolean")
          throw new Error("include_maybe must be true or false.");

        const accepted = input.include_maybe ? new Set(["yes", "maybe"]) : new Set(["yes"]);
        const matches: UpcomingItem[] = [];

        for (const { item, scheduled } of await visible(context)) {
          if (accepted.has(item.rsvps[context.userId] ?? "") || (await isInterested(scheduled, context.userId)))
            matches.push(item);

          if (matches.length >= requestedLimit(input.limit)) break;
        }

        return JSON.stringify({
          scope: "requesting-user-attendance",
          requesting_user_filtered: true,
          requesting_user_id: context.userId,
          instruction:
            "These are the requesting user's events. Address the requester as 'you'; never say you or the bot are attending.",
          events: matches.map((item) => itemSummary(item, context.userId)),
          total_returned: matches.length,
        });
      },
    },
  ];
}
