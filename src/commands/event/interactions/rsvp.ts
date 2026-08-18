import { MessageFlags, type ButtonInteraction } from "discord.js";
import { setRsvp, type RsvpStatus } from "../../../shared/rsvp.js";
import { renderEvent } from "../renderers/event.js";
import type { BotStore } from "../../../store.js";
import type { CommunityEvent } from "../types.js";

export async function handleEventRsvp(
  store: BotStore,
  interaction: ButtonInteraction,
  event: CommunityEvent,
  status: RsvpStatus,
): Promise<void> {
  if (!setRsvp(event.rsvps, interaction.user.id, status, event.attendanceLimit)) {
    await interaction.reply({
      content: "This event has reached its attendance limit.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  await store.setEvent(event);
  await interaction.update(renderEvent(event));
}
