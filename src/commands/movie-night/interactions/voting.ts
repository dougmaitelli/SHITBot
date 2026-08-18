import {
  ActionRowBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { isOrganizerOrModerator } from "../../../authorization.js";
import { logger } from "../../../logger.js";
import { MAX_SUGGESTIONS } from "../constants.js";
import { updateScheduledEventMovie } from "../scheduled-event.js";
import type { CommandContext } from "../../types.js";
import type { MovieNightMessageService } from "../messages.js";
import type { MovieNight } from "../types.js";

export interface VotingInteractionHandlers {
  showVoteMenu(interaction: ButtonInteraction, night: MovieNight): Promise<void>;
  castVote(interaction: StringSelectMenuInteraction, night: MovieNight): Promise<void>;
  showFinalizeMenu(interaction: ButtonInteraction, night: MovieNight): Promise<void>;
  pickMovie(interaction: StringSelectMenuInteraction, night: MovieNight): Promise<void>;
}

export function createVotingInteractionHandlers(
  { client, store, config }: CommandContext,
  messages: MovieNightMessageService,
): VotingInteractionHandlers {
  function suggestionMenu(night: MovieNight, customId: string, placeholder: string) {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .addOptions(
          night.suggestions.slice(0, MAX_SUGGESTIONS).map((item) => ({
            label: `${item.title}${item.releaseYear ? ` (${item.releaseYear})` : ""}`.slice(0, 100),
            value: item.id,
            description: `${item.voters.length} vote(s)`,
          })),
        ),
    );
  }

  async function showVoteMenu(interaction: ButtonInteraction, night: MovieNight): Promise<void> {
    if (!night.votingOpen || night.suggestions.length === 0) {
      await interaction.reply({
        content: "There are no movies available to vote for.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    await interaction.reply({
      content: "Choose your movie. Selecting a different one moves your vote.",
      components: [suggestionMenu(night, `castVote:${night.id}`, "Choose a movie")],
      flags: MessageFlags.Ephemeral,
    });
  }

  async function castVote(interaction: StringSelectMenuInteraction, night: MovieNight): Promise<void> {
    if (!night.votingOpen) {
      await interaction.update({ content: "Movie voting has closed.", components: [] });

      return;
    }

    const selected = night.suggestions.find((item) => item.id === interaction.values[0]);

    if (!selected) {
      await interaction.update({ content: "That suggestion no longer exists.", components: [] });

      return;
    }

    const previousSelections = night.suggestions.filter((suggestion) =>
      suggestion.voters.includes(interaction.user.id),
    );

    if (previousSelections.length === 1 && previousSelections[0]?.id === selected.id) {
      await interaction.update({ content: `Your vote is already for **${selected.title}**.`, components: [] });

      return;
    }

    for (const suggestion of previousSelections) {
      suggestion.voters = suggestion.voters.filter((id) => id !== interaction.user.id);
    }

    selected.voters.push(interaction.user.id);
    await store.set(night);
    await messages.updateNight(night);
    const changedSuggestions = new Map(
      [...previousSelections, selected].map((suggestion) => [suggestion.id, suggestion]),
    );

    await Promise.allSettled(
      [...changedSuggestions.values()].map((suggestion) => messages.updateSuggestion(night, suggestion)),
    );
    await interaction.update({ content: `Your vote is now for **${selected.title}**.`, components: [] });
  }

  async function showFinalizeMenu(interaction: ButtonInteraction, night: MovieNight): Promise<void> {
    if (!(await isOrganizerOrModerator(interaction.guild, interaction.user.id, night.creatorId, config.roles))) {
      await interaction.reply({
        content: "Only the movie night's organizer can choose the movie.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    await interaction.reply({
      content: "Choose the final movie. This closes voting.",
      components: [suggestionMenu(night, `pickMovie:${night.id}`, "Choose the final movie")],
      flags: MessageFlags.Ephemeral,
    });
  }

  async function pickMovie(interaction: StringSelectMenuInteraction, night: MovieNight): Promise<void> {
    if (
      !(await isOrganizerOrModerator(interaction.guild, interaction.user.id, night.creatorId, config.roles)) ||
      !night.votingOpen
    ) {
      await interaction.update({ content: "You can't finalize this movie night.", components: [] });

      return;
    }

    const winner = night.suggestions.find((item) => item.id === interaction.values[0]);

    if (!winner) {
      await interaction.update({ content: "That suggestion no longer exists.", components: [] });

      return;
    }

    night.movie = `${winner.title}${winner.releaseYear ? ` (${winner.releaseYear})` : ""}`;
    night.votingOpen = false;
    await store.set(night);
    await updateScheduledEventMovie(client, night).catch((error) =>
      logger.error("Could not update scheduled event", {
        error,
        scheduledEventId: night.scheduledEventId,
      }),
    );
    await messages.updateAll(night);
    await interaction.update({
      content: `The movie is **${winner.title}**. Voting is now closed.`,
      components: [],
    });
  }

  return { showVoteMenu, castVote, showFinalizeMenu, pickMovie };
}
