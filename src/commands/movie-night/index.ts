import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { isOrganizerOrModerator } from "../../authorization.js";
import { logger } from "../../logger.js";
import { setRsvp } from "../../shared/rsvp.js";
import { parseDate } from "../../utils/date-parser.js";
import { buildCommand } from "../command-schema.js";
import { registerMovieNightAssistantTools } from "./assistant-tools.js";
import { isMovieNightChannel } from "./channel-policy.js";
import { createMovieNight } from "./create-night.js";
import { startExpirationJob } from "./expiration-job.js";
import { renderNight } from "./night-render.js";
import { deleteScheduledEvent, updateScheduledEventMovie } from "./scheduled-event.js";
import { renderSuggestion } from "./suggestion-render.js";
import { TmdbClient, type MovieDetails, type MovieMatch } from "./tmdb.js";
import type { CommandFactory, CommandModule, GuildCommandInteraction } from "../types.js";
import type { MovieNight, MovieSuggestion, RsvpStatus } from "./types.js";

const MAX_SUGGESTIONS = 25;

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

function isClosed(night: MovieNight): boolean {
  return Boolean(night.closedAt) || night.startsAt <= Math.floor(Date.now() / 1000);
}

const createMovieNightCommand: CommandFactory = ({ client, store, config, assistantTools }): CommandModule => {
  const channelName = config.movieNightsChannel.replace(/^#/, "");
  const tmdb = new TmdbClient(config.tmdbApiToken);
  const pendingMatches = new Map<
    string,
    {
      nightId: string;
      userId: string;
      query: string;
      matches: MovieMatch[];
    }
  >();

  async function getAssistantMovieChannel(channelId: string) {
    const channel = await client.channels.fetch(channelId);

    if (
      !channel?.isTextBased() ||
      channel.isDMBased() ||
      !channel.isSendable() ||
      !isMovieNightChannel(channel.name, channelName)
    ) {
      throw new Error(`Movie features can only be used in #${channelName}.`);
    }

    return channel;
  }

  registerMovieNightAssistantTools(
    client,
    store,
    assistantTools,
    config.timeZone,
    getAssistantMovieChannel,
    channelName,
    tmdb,
    config.roles,
  );

  async function updateMessage(night: MovieNight): Promise<void> {
    const channel = await client.channels.fetch(night.channelId);

    if (!channel?.isTextBased() || channel.isDMBased()) return;

    const message = await channel.messages.fetch(night.messageId);

    await message.edit(renderNight(night));
  }

  async function getNightChannel(night: MovieNight) {
    const channel = await client.channels.fetch(night.channelId);

    return channel?.isTextBased() && !channel.isDMBased() ? channel : undefined;
  }

  async function sendSuggestionCard(night: MovieNight, suggestion: MovieSuggestion): Promise<string> {
    const channel = await getNightChannel(night);

    if (!channel) throw new Error(`Could not find text channel ${night.channelId}`);

    const message = await channel.send(renderSuggestion(night, suggestion));

    return message.id;
  }

  async function updateSuggestionCard(night: MovieNight, suggestion: MovieSuggestion): Promise<void> {
    if (!suggestion.messageId) return;

    const channel = await getNightChannel(night);

    if (!channel) return;

    const message = await channel.messages.fetch(suggestion.messageId);

    await message.edit(renderSuggestion(night, suggestion));
  }

  async function updateSuggestionCards(night: MovieNight): Promise<void> {
    await Promise.allSettled(night.suggestions.map((suggestion) => updateSuggestionCard(night, suggestion)));
  }

  async function updateNightMessages(night: MovieNight): Promise<void> {
    await updateMessage(night);
    await updateSuggestionCards(night);
  }

  async function deleteSuggestionCard(night: MovieNight, suggestion: MovieSuggestion): Promise<void> {
    if (!suggestion.messageId) return;

    const channel = await getNightChannel(night);

    if (!channel) return;

    const message = await channel.messages.fetch(suggestion.messageId);

    await message.delete();
  }

  async function deleteSuggestionCards(night: MovieNight): Promise<void> {
    await Promise.allSettled(night.suggestions.map((suggestion) => deleteSuggestionCard(night, suggestion)));
  }

  async function createNight(interaction: GuildCommandInteraction): Promise<void> {
    if (!isMovieNightChannel(interaction.channel?.name, channelName)) {
      const configuredChannel = interaction.guild.channels.cache.find((channel) => channel.name === channelName);

      await interaction.reply({
        content: `Movie nights can only be created in ${configuredChannel ? `<#${configuredChannel.id}>` : `#${channelName}`}.`,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const startsAt = parseDate(interaction.options.getString("when", true), config.timeZone);

    if (!startsAt) {
      await interaction.reply({
        content:
          "I couldn't understand that date and time. Try `2 october 7pm`, `08/15/2026 19:30`, or `2026-08-15 19:30-07:00`.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    if (startsAt <= Math.floor(Date.now() / 1000)) {
      await interaction.reply({
        content: "The movie night must be scheduled in the future.",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const movie = interaction.options.getString("movie")?.trim() || null;

    await interaction.deferReply();
    try {
      await createMovieNight(
        client,
        store,
        {
          guild: interaction.guild,
          channelId: interaction.channelId,
          creatorId: interaction.user.id,
          startsAt,
          location: interaction.options.getString("location", true).trim(),
          movie,
          attendanceLimit: interaction.options.getInteger("attendance-limit") ?? undefined,
          durationMinutes: interaction.options.getInteger("duration") ?? 180,
        },
        (options) => interaction.editReply(options),
      );
    } catch (error) {
      logger.error("Could not create movie night", {
        error,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
      });
      await interaction.deleteReply().catch(() => undefined);
      await interaction.followUp({
        content: "I couldn't create the movie night. Check my channel and **Create Events** permissions.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  async function handleRsvp(interaction: ButtonInteraction, night: MovieNight, status: RsvpStatus): Promise<void> {
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

  async function showSuggestionModal(interaction: ButtonInteraction, night: MovieNight): Promise<void> {
    if (!night.votingOpen) {
      await interaction.reply({
        content: "Movie voting has closed.",
        flags: MessageFlags.Ephemeral,
      });

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

  function isDuplicateSuggestion(night: MovieNight, suggestion: Pick<MovieSuggestion, "title" | "tmdbId">): boolean {
    return night.suggestions.some((item) =>
      suggestion.tmdbId !== undefined && item.tmdbId !== undefined
        ? suggestion.tmdbId === item.tmdbId
        : item.title.localeCompare(suggestion.title, undefined, { sensitivity: "accent" }) === 0,
    );
  }

  async function saveSuggestion(
    night: MovieNight,
    suggestion: Omit<MovieSuggestion, "id" | "suggestedBy" | "voters">,
    userId: string,
  ): Promise<"added" | "duplicate" | "full"> {
    if (night.suggestions.length >= MAX_SUGGESTIONS) {
      return "full";
    }

    if (isDuplicateSuggestion(night, suggestion)) {
      return "duplicate";
    }

    const savedSuggestion: MovieSuggestion = {
      id: randomUUID().slice(0, 8),
      ...suggestion,
      suggestedBy: userId,
      voters: [],
    };

    savedSuggestion.messageId = await sendSuggestionCard(night, savedSuggestion);
    night.suggestions.push(savedSuggestion);
    try {
      await store.set(night);
      await updateMessage(night);
    } catch (error) {
      night.suggestions = night.suggestions.filter((item) => item.id !== savedSuggestion.id);
      await deleteSuggestionCard(night, savedSuggestion).catch(() => undefined);
      throw error;
    }

    return "added";
  }

  function saveResultMessage(result: "added" | "duplicate" | "full", title: string): string {
    if (result === "full") return `The ballot already has the maximum of ${MAX_SUGGESTIONS} suggestions.`;

    if (result === "duplicate") return "That movie has already been suggested. You can vote for it instead.";

    return `Added **${title}** to the ballot.`;
  }

  async function addSuggestion(interaction: ModalSubmitInteraction, night: MovieNight): Promise<void> {
    const query = interaction.fields.getTextInputValue("title").trim();

    if (!night.votingOpen) {
      await interaction.reply({
        content: "Movie voting has closed.",
        flags: MessageFlags.Ephemeral,
      });

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
      logger.error("Could not search TMDB", {
        error,
        guildId: interaction.guildId,
        userId: interaction.user.id,
      });
      const result = await saveSuggestion(night, { title: query }, interaction.user.id);

      await interaction.editReply(
        `${saveResultMessage(result, query)} TMDB search was unavailable, so I kept the title as entered.`,
      );

      return;
    }

    if (matches.length === 0) {
      const result = await saveSuggestion(night, { title: query }, interaction.user.id);

      await interaction.editReply(`${saveResultMessage(result, query)} I couldn't find a matching movie on TMDB.`);

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

  async function chooseMovieMatch(
    interaction: StringSelectMenuInteraction,
    night: MovieNight,
    token: string | undefined,
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
      const result = await saveSuggestion(night, { title: pending.query }, interaction.user.id);

      await interaction.editReply({
        content: saveResultMessage(result, pending.query),
        components: [],
      });

      return;
    }

    const tmdbId = Number(selectedValue?.replace(/^tmdb:/, ""));
    const match = pending.matches.find((candidate) => candidate.tmdbId === tmdbId);

    if (!match) {
      await interaction.editReply({
        content: "That movie match is no longer available.",
        components: [],
      });

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
    const result = await saveSuggestion(
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

    await interaction.editReply({
      content: saveResultMessage(result, displayTitle),
      components: [],
    });
  }

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
      await interaction.update({
        content: `Your vote is already for **${selected.title}**.`,
        components: [],
      });

      return;
    }

    for (const suggestion of previousSelections) {
      suggestion.voters = suggestion.voters.filter((id) => id !== interaction.user.id);
    }

    selected.voters.push(interaction.user.id);
    await store.set(night);
    await updateMessage(night);
    const changedSuggestions = new Map(
      [...previousSelections, selected].map((suggestion) => [suggestion.id, suggestion]),
    );

    await Promise.allSettled(
      [...changedSuggestions.values()].map((suggestion) => updateSuggestionCard(night, suggestion)),
    );
    await interaction.update({
      content: `Your vote is now for **${selected.title}**.`,
      components: [],
    });
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
    await updateNightMessages(night);
    await interaction.update({
      content: `The movie is **${winner.title}**. Voting is now closed.`,
      components: [],
    });
  }

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
    await deleteSuggestionCards(night);
    await store.delete(night.id);
    await interaction.message.delete();
  }

  async function deleteSuggestion(
    interaction: ButtonInteraction,
    night: MovieNight,
    suggestionId: string | undefined,
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
    await updateMessage(night);
    await interaction.message.delete();
  }

  async function handleInteraction(interaction: Interaction): Promise<boolean> {
    if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return false;

    const [action, nightId, value] = interaction.customId.split(":");

    if (!action || !componentActions.has(action)) return false;

    const night = nightId ? store.get(nightId) : undefined;

    if (!night) {
      await interaction.reply({
        content: "I couldn't find that movie night. It may have been removed.",
        flags: MessageFlags.Ephemeral,
      });

      return true;
    }

    if (isClosed(night) && action !== "delete") {
      if (!night.closedAt) {
        night.closedAt = Date.now();
        await store.set(night);
        await updateNightMessages(night).catch(() => undefined);
      }

      await interaction.reply({
        content: "This movie night has started and is no longer editable.",
        flags: MessageFlags.Ephemeral,
      });

      return true;
    }

    if (interaction.isButton()) {
      if (action === "rsvp" && (value === "yes" || value === "maybe" || value === "no")) {
        await handleRsvp(interaction, night, value);
      } else if (action === "suggest") await showSuggestionModal(interaction, night);
      else if (action === "vote") await showVoteMenu(interaction, night);
      else if (action === "finalize") await showFinalizeMenu(interaction, night);
      else if (action === "delete") await deleteNight(interaction, night);
      else if (action === "deleteSuggestion") await deleteSuggestion(interaction, night, value);
    } else if (interaction.isModalSubmit() && action === "suggestModal") await addSuggestion(interaction, night);
    else if (interaction.isStringSelectMenu() && action === "movieMatch")
      await chooseMovieMatch(interaction, night, value);
    else if (interaction.isStringSelectMenu() && action === "castVote") await castVote(interaction, night);
    else if (interaction.isStringSelectMenu() && action === "pickMovie") await pickMovie(interaction, night);

    return true;
  }

  return {
    data: buildCommand({
      name: "movie-night",
      description: "Organize a movie night",
      subcommands: [
        {
          name: "create",
          description: "Create a new movie night",
          options: [
            {
              type: "string",
              name: "when",
              description: "Date and time, e.g. 2026-08-15 7:30 PM or 08/15/2026 19:30",
              maxLength: 100,
              required: true,
            },
            {
              type: "string",
              name: "location",
              description: "Where the movie night is happening",
              maxLength: 200,
              required: true,
            },
            {
              type: "string",
              name: "movie",
              description: "Movie title; omit it to let people suggest and vote",
              maxLength: 100,
            },
            {
              type: "integer",
              name: "duration",
              description: "Duration in minutes (default: 180)",
              minValue: 30,
              maxValue: 720,
            },
            {
              type: "integer",
              name: "attendance-limit",
              description: "Maximum number of people who can RSVP Going",
              minValue: 1,
              maxValue: 100000,
            },
          ],
        },
      ],
    }),

    async execute(interaction: GuildCommandInteraction): Promise<void> {
      if (interaction.options.getSubcommand() === "create") await createNight(interaction);
    },
    handleInteraction,
    onReady(): void {
      startExpirationJob(store, updateNightMessages);
    },
  };
};

export default createMovieNightCommand;
