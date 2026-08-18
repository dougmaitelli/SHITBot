import { MessageFlags, type ButtonInteraction } from "discord.js";
import { isOrganizerOrModerator } from "../../../authorization.js";
import { logger } from "../../../logger.js";
import { deleteScheduledEvent } from "../scheduled-event.js";
import type { CommandContext } from "../../types.js";
import type { MovieNightMessageService } from "../messages.js";
import type { MovieNight } from "../types.js";

export interface DeleteInteractionHandlers {
  deleteNight(interaction: ButtonInteraction, night: MovieNight): Promise<void>;
  deleteSuggestion(interaction: ButtonInteraction, night: MovieNight, suggestionId?: string): Promise<void>;
}

export function createDeleteInteractionHandlers(
  { client, store, config }: CommandContext,
  messages: MovieNightMessageService,
): DeleteInteractionHandlers {
  async function deleteNight(interaction: ButtonInteraction, night: MovieNight): Promise<void> {
    if (!(await isOrganizerOrModerator(interaction.guild, interaction.user.id, night.creatorId, config.roles))) {
      await interaction.reply({
        content: "Only the movie night's organizer can delete it.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    await interaction.deferUpdate();
    await deleteScheduledEvent(client, night).catch((error) =>
      logger.error("Could not delete scheduled event", {
        error,
        scheduledEventId: night.scheduledEventId,
      }),
    );
    await messages.deleteSuggestions(night);
    await store.delete(night.id);
    await interaction.message.delete();
  }

  async function deleteSuggestion(
    interaction: ButtonInteraction,
    night: MovieNight,
    suggestionId?: string,
  ): Promise<void> {
    const suggestion = night.suggestions.find((item) => item.id === suggestionId);

    if (!suggestion) {
      await interaction.reply({
        content: "That suggestion no longer exists.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    if (
      interaction.user.id !== suggestion.suggestedBy &&
      !(await isOrganizerOrModerator(interaction.guild, interaction.user.id, night.creatorId, config.roles))
    ) {
      await interaction.reply({
        content: "Only the person who suggested this movie or the movie night's organizer can delete it.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    await interaction.deferUpdate();
    night.suggestions = night.suggestions.filter((item) => item.id !== suggestion.id);
    await store.set(night);
    await messages.updateNight(night);
    await interaction.message.delete();
  }

  return { deleteNight, deleteSuggestion };
}
