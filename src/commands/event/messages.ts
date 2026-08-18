import { renderEvent } from "./renderers/event.js";
import type { CommunityEvent } from "./types.js";
import type { Client } from "discord.js";

export interface EventMessageService {
  update(event: CommunityEvent): Promise<void>;
}

export function createEventMessageService(client: Client): EventMessageService {
  return {
    async update(event): Promise<void> {
      const channel = await client.channels.fetch(event.channelId);

      if (!channel?.isTextBased() || channel.isDMBased()) return;

      const message = await channel.messages.fetch(event.messageId);

      await message.edit(renderEvent(event));
    },
  };
}
