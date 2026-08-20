import { eventCalendarAttachment } from "../../shared/calendar.js";
import { renderEvent } from "./renderers/event.js";
import { isEventClosed } from "./status.js";
import type { CommunityEvent } from "./types.js";
import type { Client } from "discord.js";

export interface EventMessageService {
  update(event: CommunityEvent, refreshCalendar?: boolean): Promise<void>;
  reconcilePin(event: CommunityEvent): Promise<void>;
}

export function createEventMessageService(client: Client): EventMessageService {
  async function getMessage(event: CommunityEvent) {
    const channel = await client.channels.fetch(event.channelId);

    if (!channel?.isTextBased() || channel.isDMBased()) return undefined;

    return channel.messages.fetch(event.messageId);
  }

  return {
    async update(event, refreshCalendar = false): Promise<void> {
      const message = await getMessage(event);

      if (!message) return;

      await Promise.all([
        message.edit({
          ...renderEvent(event),
          ...(refreshCalendar ? { attachments: [], files: [eventCalendarAttachment(event)] } : {}),
        }),
        ...(event.closedAt ? [message.unpin()] : []),
      ]);
    },
    async reconcilePin(event): Promise<void> {
      const message = await getMessage(event);

      if (!message) return;

      if (isEventClosed(event)) {
        if (message.pinned) await message.unpin();
      } else if (!message.pinned) await message.pin();
    },
  };
}
