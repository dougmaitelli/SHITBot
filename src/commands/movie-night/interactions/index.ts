import { MessageFlags, type Interaction } from "discord.js";
import { isMovieNightClosed } from "../status.js";
import { createDeleteInteractionHandlers } from "./delete.js";
import { handleMovieNightRsvp } from "./rsvp.js";
import { createSuggestionInteractionHandlers } from "./suggestions.js";
import { createVotingInteractionHandlers } from "./voting.js";
import type { CommandContext } from "../../types.js";
import type { MovieNightMessageService } from "../messages.js";
import type { TmdbClient } from "../tmdb.js";

const componentActions = new Set([
  "rsvp",
  "suggest",
  "vote",
  "finalize",
  "delete",
  "suggestModal",
  "movieMatch",
  "castVote",
  "pickMovie",
  "deleteSuggestion",
]);

export function createMovieNightInteractionHandler(
  context: CommandContext,
  messages: MovieNightMessageService,
  tmdb: TmdbClient,
) {
  const suggestions = createSuggestionInteractionHandlers(context, messages, tmdb);
  const voting = createVotingInteractionHandlers(context, messages);
  const deletion = createDeleteInteractionHandlers(context, messages);

  return async (interaction: Interaction): Promise<boolean> => {
    if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return false;

    const [action, nightId, value] = interaction.customId.split(":");

    if (!action || !componentActions.has(action)) return false;

    const night = nightId ? context.store.get(nightId) : undefined;

    if (!night) {
      await interaction.reply({
        content: "I couldn't find that movie night. It may have been removed.",
        flags: MessageFlags.Ephemeral,
      });

      return true;
    }

    if (isMovieNightClosed(night) && action !== "delete") {
      if (!night.closedAt) {
        night.closedAt = Date.now();
        await context.store.set(night);
        await messages.updateAll(night).catch(() => undefined);
      }

      await interaction.reply({
        content: "This movie night has started and is no longer editable.",
        flags: MessageFlags.Ephemeral,
      });

      return true;
    }

    if (interaction.isButton()) {
      if (action === "rsvp" && (value === "yes" || value === "maybe" || value === "no"))
        await handleMovieNightRsvp(context.store, interaction, night, value);
      else if (action === "suggest") await suggestions.showModal(interaction, night);
      else if (action === "vote") await voting.showVoteMenu(interaction, night);
      else if (action === "finalize") await voting.showFinalizeMenu(interaction, night);
      else if (action === "delete") await deletion.deleteNight(interaction, night);
      else if (action === "deleteSuggestion") await deletion.deleteSuggestion(interaction, night, value);
    } else if (interaction.isModalSubmit() && action === "suggestModal") await suggestions.add(interaction, night);
    else if (interaction.isStringSelectMenu() && action === "movieMatch")
      await suggestions.chooseMatch(interaction, night, value);
    else if (interaction.isStringSelectMenu() && action === "castVote") await voting.castVote(interaction, night);
    else if (interaction.isStringSelectMenu() && action === "pickMovie") await voting.pickMovie(interaction, night);

    return true;
  };
}
