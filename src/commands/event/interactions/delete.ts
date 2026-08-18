import { MessageFlags, type ButtonInteraction } from "discord.js";
import { isOrganizerOrModerator } from "../../../authorization.js";
import { logger } from "../../../logger.js";
import { deleteScheduledEvent } from "../scheduled-event.js";
import type { CommandContext } from "../../types.js";
import type { CommunityEvent } from "../types.js";

export async function deleteEvent(
  { client, store, config }: CommandContext,
  interaction: ButtonInteraction,
  event: CommunityEvent,
): Promise<void> {
  if (!(await isOrganizerOrModerator(interaction.guild, interaction.user.id, event.creatorId, config.roles))) {
    await interaction.reply({
      content: "Only the event organizer can delete it.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  await interaction.deferUpdate();
  await deleteScheduledEvent(client, event).catch((error) =>
    logger.error("Could not delete scheduled event", {
      error,
      scheduledEventId: event.scheduledEventId,
    }),
  );
  await store.deleteEvent(event.id);
  await interaction.message.delete().catch((error: unknown) => {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === 10008)) throw error;
  });
}
