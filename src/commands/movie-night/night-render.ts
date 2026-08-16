import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { buildRsvpButtons, buildRsvpFields } from "../../shared/rsvp.js";
import { buildSuggestionField } from "./suggestion-search-render.js";
import type { MovieNight } from "./types.js";

function isClosed(night: MovieNight): boolean {
  return Boolean(night.closedAt) || night.startsAt <= Math.floor(Date.now() / 1000);
}

function buildEmbed(night: MovieNight, closed: boolean): EmbedBuilder {
  const activityFields = buildRsvpFields(night.rsvps, night.attendanceLimit);
  if (night.scheduledEventId) {
    activityFields.unshift({
      name: "Discord event",
      value: `[View event](https://discord.com/events/${night.guildId}/${night.scheduledEventId})`,
      inline: true,
    });
  }
  if (night.votingOpen) activityFields.push(buildSuggestionField(night));

  return new EmbedBuilder()
    .setColor(closed ? 0x747f8d : night.votingOpen ? 0xf1c40f : 0x5865f2)
    .setTitle(night.movie ? `🎬 ${night.movie}` : "🎬 Movie Night — movie TBD")
    .setDescription(`Organized by <@${night.creatorId}>`)
    .addFields(
      { name: "When", value: `<t:${night.startsAt}:F>\n<t:${night.startsAt}:R>`, inline: true },
      { name: "Where", value: night.location, inline: true },
      ...activityFields,
    )
    .setFooter({ text: closed ? "This movie night is closed" : night.votingOpen ? "Movie voting is open" : "RSVP below" });
}

function buildDeleteButton(night: MovieNight): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`delete:${night.id}`)
    .setLabel("Delete movie night")
    .setEmoji("🗑️")
    .setStyle(ButtonStyle.Danger);
}

function buildActionButtons(night: MovieNight, closed: boolean): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (night.votingOpen) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`suggest:${night.id}`)
        .setLabel("Suggest a movie")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(closed),
      new ButtonBuilder()
        .setCustomId(`vote:${night.id}`)
        .setLabel("Vote")
        .setEmoji("🗳️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(closed || night.suggestions.length === 0),
      new ButtonBuilder()
        .setCustomId(`finalize:${night.id}`)
        .setLabel("Define movie")
        .setEmoji("🎬")
        .setStyle(ButtonStyle.Success)
        .setDisabled(closed || night.suggestions.length === 0),
    );
  }
  return row.addComponents(buildDeleteButton(night));
}

export function renderNight(night: MovieNight) {
  const closed = isClosed(night);
  return {
    embeds: [buildEmbed(night, closed)],
    components: [buildRsvpButtons(night.id, "rsvp", closed), buildActionButtons(night, closed)],
  };
}
