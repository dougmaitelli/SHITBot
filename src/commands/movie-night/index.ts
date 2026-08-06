import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { CommandFactory, CommandModule } from "../types.js";
import { parseMovieNightDate } from "./date-parser.js";
import { startExpirationJob } from "./expiration-job.js";
import { renderNight } from "./presentation.js";
import { createScheduledEvent, deleteScheduledEvent, updateScheduledEventMovie } from "./scheduled-event.js";
import type { MovieNight, RsvpStatus } from "./types.js";

const componentActions = new Set([
  "rsvp",
  "suggest",
  "vote",
  "finalize",
  "delete",
  "suggestModal",
  "castVote",
  "pickMovie",
]);

function isClosed(night: MovieNight): boolean {
  return Boolean(night.closedAt) || night.startsAt <= Math.floor(Date.now() / 1000);
}

const createMovieNightCommand: CommandFactory = ({ client, store, config }): CommandModule => {
  const channelName = config.movieNightsChannel.replace(/^#/, "");

  async function updateMessage(night: MovieNight): Promise<void> {
    const channel = await client.channels.fetch(night.channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    const message = await channel.messages.fetch(night.messageId);
    await message.edit(renderNight(night));
  }

  async function createNight(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inCachedGuild() || !interaction.channelId) {
      await interaction.reply({ content: "Movie nights can only be created in a server channel.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.channel?.name !== channelName) {
      const configuredChannel = interaction.guild.channels.cache.find((channel) => channel.name === channelName);
      await interaction.reply({
        content: `Movie nights can only be created in ${configuredChannel ? `<#${configuredChannel.id}>` : `#${channelName}`}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const startsAt = parseMovieNightDate(interaction.options.getString("when", true), config.timeZone);
    if (!startsAt) {
      await interaction.reply({
        content: "I couldn't understand that date and time. Try `2 october 7pm`, `08/15/2026 19:30`, or `2026-08-15 19:30-07:00`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (startsAt <= Math.floor(Date.now() / 1000)) {
      await interaction.reply({ content: "The movie night must be scheduled in the future.", flags: MessageFlags.Ephemeral });
      return;
    }

    const movie = interaction.options.getString("movie")?.trim() || null;
    const night: MovieNight = {
      id: randomUUID().slice(0, 8),
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: "",
      creatorId: interaction.user.id,
      startsAt,
      location: interaction.options.getString("location", true).trim(),
      movie,
      votingOpen: movie === null,
      rsvps: {},
      suggestions: [],
      createdAt: Date.now(),
    };

    const durationMinutes = interaction.options.getInteger("duration") ?? 180;
    await interaction.deferReply();
    try {
      night.scheduledEventId = await createScheduledEvent(interaction.guild, night, durationMinutes);
    } catch (error) {
      console.error("Could not create Discord scheduled event", error);
      await interaction.deleteReply().catch(() => undefined);
      await interaction.followUp({
        content: "I couldn't create the Discord event. Check that I have the **Create Events** permission.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const message = await interaction.editReply(renderNight(night));
      night.messageId = message.id;
      await store.set(night);
    } catch (error) {
      await deleteScheduledEvent(client, night).catch(() => undefined);
      await interaction.deleteReply().catch(() => undefined);
      throw error;
    }
  }

  async function handleRsvp(interaction: ButtonInteraction, night: MovieNight, status: RsvpStatus): Promise<void> {
    night.rsvps[interaction.user.id] = status;
    await store.set(night);
    await interaction.update(renderNight(night));
  }

  async function showSuggestionModal(interaction: ButtonInteraction, night: MovieNight): Promise<void> {
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

  async function addSuggestion(interaction: ModalSubmitInteraction, night: MovieNight): Promise<void> {
    const title = interaction.fields.getTextInputValue("title").trim();
    if (!night.votingOpen) {
      await interaction.reply({ content: "Movie voting has closed.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (night.suggestions.length >= 25) {
      await interaction.reply({ content: "The ballot already has the maximum of 25 suggestions.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (night.suggestions.some((item) => item.title.localeCompare(title, undefined, { sensitivity: "accent" }) === 0)) {
      await interaction.reply({ content: "That movie has already been suggested. You can vote for it instead.", flags: MessageFlags.Ephemeral });
      return;
    }
    night.suggestions.push({ id: randomUUID().slice(0, 8), title, suggestedBy: interaction.user.id, voters: [] });
    await store.set(night);
    await updateMessage(night);
    await interaction.reply({ content: `Added **${title}** to the ballot.`, flags: MessageFlags.Ephemeral });
  }

  function suggestionMenu(night: MovieNight, customId: string, placeholder: string) {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .addOptions(
          night.suggestions.slice(0, 25).map((item) => ({
            label: item.title,
            value: item.id,
            description: `${item.voters.length} vote(s)`,
          })),
        ),
    );
  }

  async function showVoteMenu(interaction: ButtonInteraction, night: MovieNight): Promise<void> {
    if (!night.votingOpen || night.suggestions.length === 0) {
      await interaction.reply({ content: "There are no movies available to vote for.", flags: MessageFlags.Ephemeral });
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
    for (const suggestion of night.suggestions) {
      suggestion.voters = suggestion.voters.filter((id) => id !== interaction.user.id);
    }
    const selected = night.suggestions.find((item) => item.id === interaction.values[0]);
    if (!selected) {
      await interaction.update({ content: "That suggestion no longer exists.", components: [] });
      return;
    }
    selected.voters.push(interaction.user.id);
    await store.set(night);
    await updateMessage(night);
    await interaction.update({ content: `Your vote is now for **${selected.title}**.`, components: [] });
  }

  async function showFinalizeMenu(interaction: ButtonInteraction, night: MovieNight): Promise<void> {
    if (interaction.user.id !== night.creatorId) {
      await interaction.reply({ content: "Only the movie night's organizer can choose the movie.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      content: "Choose the final movie. This closes voting.",
      components: [suggestionMenu(night, `pickMovie:${night.id}`, "Choose the final movie")],
      flags: MessageFlags.Ephemeral,
    });
  }

  async function pickMovie(interaction: StringSelectMenuInteraction, night: MovieNight): Promise<void> {
    if (interaction.user.id !== night.creatorId || !night.votingOpen) {
      await interaction.update({ content: "You can't finalize this movie night.", components: [] });
      return;
    }
    const winner = night.suggestions.find((item) => item.id === interaction.values[0]);
    if (!winner) {
      await interaction.update({ content: "That suggestion no longer exists.", components: [] });
      return;
    }
    night.movie = winner.title;
    night.votingOpen = false;
    await store.set(night);
    await updateScheduledEventMovie(client, night).catch((error) =>
      console.error(`Could not update scheduled event ${night.scheduledEventId}`, error),
    );
    await updateMessage(night);
    await interaction.update({ content: `The movie is **${winner.title}**. Voting is now closed.`, components: [] });
  }

  async function deleteNight(interaction: ButtonInteraction, night: MovieNight): Promise<void> {
    if (interaction.user.id !== night.creatorId) {
      await interaction.reply({ content: "Only the movie night's organizer can delete it.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferUpdate();
    await deleteScheduledEvent(client, night).catch((error) =>
      console.error(`Could not delete scheduled event ${night.scheduledEventId}`, error),
    );
    await store.delete(night.id);
    await interaction.message.delete();
  }

  async function handleInteraction(interaction: Interaction): Promise<boolean> {
    if (!interaction.isButton() && !interaction.isModalSubmit() && !interaction.isStringSelectMenu()) return false;
    const [action, nightId, value] = interaction.customId.split(":");
    if (!action || !componentActions.has(action)) return false;

    const night = nightId ? store.get(nightId) : undefined;
    if (!night) {
      await interaction.reply({ content: "I couldn't find that movie night. It may have been removed.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (isClosed(night) && action !== "delete") {
      if (!night.closedAt) {
        night.closedAt = Date.now();
        await store.set(night);
        await updateMessage(night).catch(() => undefined);
      }
      await interaction.reply({ content: "This movie night has started and is no longer editable.", flags: MessageFlags.Ephemeral });
      return true;
    }

    if (interaction.isButton()) {
      if (action === "rsvp" && (value === "yes" || value === "maybe" || value === "no")) {
        await handleRsvp(interaction, night, value);
      } else if (action === "suggest") await showSuggestionModal(interaction, night);
      else if (action === "vote") await showVoteMenu(interaction, night);
      else if (action === "finalize") await showFinalizeMenu(interaction, night);
      else if (action === "delete") await deleteNight(interaction, night);
    } else if (interaction.isModalSubmit() && action === "suggestModal") await addSuggestion(interaction, night);
    else if (interaction.isStringSelectMenu() && action === "castVote") await castVote(interaction, night);
    else if (interaction.isStringSelectMenu() && action === "pickMovie") await pickMovie(interaction, night);
    return true;
  }

  return {
    data: new SlashCommandBuilder()
      .setName("movie-night")
      .setDescription("Organize a movie night")
      .addSubcommand((command) =>
        command
          .setName("create")
          .setDescription("Create a new movie night")
          .addStringOption((option) =>
            option
              .setName("when")
              .setDescription("Date and time, e.g. 2026-08-15 7:30 PM or 08/15/2026 19:30")
              .setMaxLength(100)
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("location")
              .setDescription("Where the movie night is happening")
              .setMaxLength(200)
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("movie")
              .setDescription("Movie title; omit it to let people suggest and vote")
              .setMaxLength(100),
          )
          .addIntegerOption((option) =>
            option
              .setName("duration")
              .setDescription("Duration in minutes (default: 180)")
              .setMinValue(30)
              .setMaxValue(720),
          ),
      )
      .toJSON(),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      if (interaction.options.getSubcommand() === "create") await createNight(interaction);
    },
    handleInteraction,
    onReady(): void {
      startExpirationJob(store, updateMessage);
    },
  };
};

export default createMovieNightCommand;
