import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { logger } from "../../../logger.js";
import { MAX_SUGGESTIONS } from "../constants.js";
import type { CommandContext } from "../../types.js";
import type { MovieNightMessageService } from "../messages.js";
import type { TmdbClient, MovieDetails, MovieMatch } from "../tmdb.js";
import type { MovieNight, MovieSuggestion } from "../types.js";

interface PendingMatch {
  nightId: string;
  userId: string;
  query: string;
  matches: MovieMatch[];
}

export interface SuggestionInteractionHandlers {
  showModal(interaction: ButtonInteraction, night: MovieNight): Promise<void>;
  add(interaction: ModalSubmitInteraction, night: MovieNight): Promise<void>;
  chooseMatch(interaction: StringSelectMenuInteraction, night: MovieNight, token?: string): Promise<void>;
}

export function createSuggestionInteractionHandlers(
  { store }: CommandContext,
  messages: MovieNightMessageService,
  tmdb: TmdbClient,
): SuggestionInteractionHandlers {
  const pendingMatches = new Map<string, PendingMatch>();

  function isDuplicate(night: MovieNight, suggestion: Pick<MovieSuggestion, "title" | "tmdbId">): boolean {
    return night.suggestions.some((item) =>
      suggestion.tmdbId !== undefined && item.tmdbId !== undefined
        ? suggestion.tmdbId === item.tmdbId
        : item.title.localeCompare(suggestion.title, undefined, { sensitivity: "accent" }) === 0,
    );
  }

  async function save(
    night: MovieNight,
    suggestion: Omit<MovieSuggestion, "id" | "suggestedBy" | "voters">,
    userId: string,
  ): Promise<"added" | "duplicate" | "full"> {
    if (night.suggestions.length >= MAX_SUGGESTIONS) return "full";

    if (isDuplicate(night, suggestion)) return "duplicate";

    const savedSuggestion: MovieSuggestion = {
      id: randomUUID().slice(0, 8),
      ...suggestion,
      suggestedBy: userId,
      voters: [],
    };

    savedSuggestion.messageId = await messages.sendSuggestion(night, savedSuggestion);
    night.suggestions.push(savedSuggestion);
    try {
      await store.set(night);
      await messages.updateNight(night);
    } catch (error) {
      night.suggestions = night.suggestions.filter((item) => item.id !== savedSuggestion.id);
      await messages.deleteSuggestion(night, savedSuggestion).catch(() => undefined);
      throw error;
    }

    return "added";
  }

  function resultMessage(result: "added" | "duplicate" | "full", title: string): string {
    if (result === "full") return `The ballot already has the maximum of ${MAX_SUGGESTIONS} suggestions.`;

    if (result === "duplicate") return "That movie has already been suggested. You can vote for it instead.";

    return `Added **${title}** to the ballot.`;
  }

  async function showModal(interaction: ButtonInteraction, night: MovieNight): Promise<void> {
    if (!night.votingOpen) {
      await interaction.reply({ content: "Movie voting has closed.", flags: MessageFlags.Ephemeral });

      return;
    }

    const modal = new ModalBuilder().setCustomId(`suggestModal:${night.id}`).setTitle("Suggest a movie");
    const title = new TextInputBuilder()
      .setCustomId("title")
      .setLabel("Movie title")
      .setMaxLength(100)
      .setRequired(true)
      .setStyle(TextInputStyle.Short);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(title));
    await interaction.showModal(modal);
  }

  async function add(interaction: ModalSubmitInteraction, night: MovieNight): Promise<void> {
    const query = interaction.fields.getTextInputValue("title").trim();

    if (!night.votingOpen) {
      await interaction.reply({ content: "Movie voting has closed.", flags: MessageFlags.Ephemeral });

      return;
    }

    if (night.suggestions.length >= MAX_SUGGESTIONS) {
      await interaction.reply({
        content: `The ballot already has the maximum of ${MAX_SUGGESTIONS} suggestions.`,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let matches: MovieMatch[];

    try {
      matches = await tmdb.searchMovies(query);
    } catch (error) {
      logger.error("Could not search TMDB", { error, guildId: interaction.guildId, userId: interaction.user.id });
      const result = await save(night, { title: query }, interaction.user.id);

      await interaction.editReply(
        `${resultMessage(result, query)} TMDB search was unavailable, so I kept the title as entered.`,
      );

      return;
    }

    if (matches.length === 0) {
      const result = await save(night, { title: query }, interaction.user.id);

      await interaction.editReply(`${resultMessage(result, query)} I couldn't find a matching movie on TMDB.`);

      return;
    }

    const token = randomUUID().slice(0, 8);

    pendingMatches.set(token, { nightId: night.id, userId: interaction.user.id, query, matches });
    const expiration = setTimeout(() => pendingMatches.delete(token), 10 * 60_000);

    expiration.unref();

    const options = matches.map((match) => ({
      label: `${match.title}${match.releaseYear ? ` (${match.releaseYear})` : ""}`.slice(0, 100),
      value: `tmdb:${match.tmdbId}`,
      description: "Use this TMDB match",
    }));

    options.push({
      label: `Use “${query}”`.slice(0, 100),
      value: "raw",
      description: "Keep the title exactly as entered",
    });

    const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`movieMatch:${night.id}:${token}`)
        .setPlaceholder("Choose the intended movie")
        .addOptions(options),
    );

    await interaction.editReply({
      content: "Choose the intended movie. Movie data provided by [TMDB](https://www.themoviedb.org/).",
      components: [menu],
    });
  }

  async function chooseMatch(
    interaction: StringSelectMenuInteraction,
    night: MovieNight,
    token?: string,
  ): Promise<void> {
    const pending = token ? pendingMatches.get(token) : undefined;

    if (!pending || pending.nightId !== night.id || pending.userId !== interaction.user.id) {
      await interaction.update({
        content: "This movie search has expired. Please suggest the movie again.",
        components: [],
      });

      return;
    }

    pendingMatches.delete(token!);
    await interaction.deferUpdate();

    const selectedValue = interaction.values[0];

    if (selectedValue === "raw") {
      const result = await save(night, { title: pending.query }, interaction.user.id);

      await interaction.editReply({ content: resultMessage(result, pending.query), components: [] });

      return;
    }

    const tmdbId = Number(selectedValue?.replace(/^tmdb:/, ""));
    const match = pending.matches.find((candidate) => candidate.tmdbId === tmdbId);

    if (!match) {
      await interaction.editReply({ content: "That movie match is no longer available.", components: [] });

      return;
    }

    let details: MovieDetails | undefined;

    try {
      details = await tmdb.getMovieDetails(match.tmdbId);
    } catch (error) {
      logger.error("Could not get TMDB movie details", { error, tmdbId: match.tmdbId });
    }
    const selected = details ?? match;
    const displayTitle = `${selected.title}${selected.releaseYear ? ` (${selected.releaseYear})` : ""}`;
    const result = await save(
      night,
      {
        title: selected.title,
        releaseYear: selected.releaseYear,
        tmdbId: selected.tmdbId,
        ...(details && {
          imdbId: details.imdbId,
          description: details.description,
          posterUrl: details.posterUrl,
          rating: details.rating,
        }),
      },
      interaction.user.id,
    );

    await interaction.editReply({ content: resultMessage(result, displayTitle), components: [] });
  }

  return { showModal, add, chooseMatch };
}
