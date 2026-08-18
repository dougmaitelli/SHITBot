import { updateScheduledEvent } from "../scheduled-event.js";
import type { BotStore } from "../../../store.js";
import type { EventMessageService } from "../messages.js";
import type { CommunityEvent } from "../types.js";
import type { Client } from "discord.js";

export type CommunityEventEdits = Partial<
  Pick<
    CommunityEvent,
    "name" | "startsAt" | "endsAt" | "fullDay" | "description" | "link" | "durationMinutes" | "attendanceLimit"
  >
>;

export async function editCommunityEvent(
  client: Client,
  store: BotStore,
  messages: EventMessageService,
  event: CommunityEvent,
  edits: CommunityEventEdits,
): Promise<CommunityEvent> {
  const updated = { ...event, ...edits };

  await updateScheduledEvent(client, updated);
  await store.setEvent(updated);
  await messages.update(updated);

  return updated;
}
