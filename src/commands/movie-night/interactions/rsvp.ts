import { MessageFlags, type ButtonInteraction } from "discord.js";
import { setRsvp } from "../../../shared/rsvp.js";
import { renderNight } from "../renderers/night.js";
import type { BotStore } from "../../../store.js";
import type { MovieNight, RsvpStatus } from "../types.js";

export async function handleMovieNightRsvp(
  store: BotStore,
  interaction: ButtonInteraction,
  night: MovieNight,
  status: RsvpStatus,
): Promise<void> {
  if (!setRsvp(night.rsvps, interaction.user.id, status, night.attendanceLimit)) {
    await interaction.reply({
      content: "This movie night has reached its attendance limit.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  await store.set(night);
  await interaction.update(renderNight(night));
}
