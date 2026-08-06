import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIEmbedField,
} from "discord.js";
import { buildSuggestionField } from "./suggestion-render.js";
import type { MovieNight, RsvpStatus } from "./types.js";

const labels: Record<RsvpStatus, string> = { yes: "Going", maybe: "Maybe", no: "Can't go" };

function isClosed(night: MovieNight): boolean {
  return Boolean(night.closedAt) || night.startsAt <= Math.floor(Date.now() / 1000);
}

function mentions(night: MovieNight, status: RsvpStatus): string {
  const users = Object.entries(night.rsvps)
    .filter(([, value]) => value === status)
    .map(([id]) => `<@${id}>`);
  const value = users.length ? users.join(", ") : "Nobody yet";
  return value.length > 1024 ? `${value.slice(0, 1021)}...` : value;
}

function buildRsvpFields(night: MovieNight): APIEmbedField[] {
  return (["yes", "maybe", "no"] as RsvpStatus[]).map((status) => ({
    name: `${labels[status]} (${Object.values(night.rsvps).filter((value) => value === status).length})`,
    value: mentions(night, status),
    inline: true,
  }));
}

function buildEmbed(night: MovieNight, closed: boolean): EmbedBuilder {
  const activityFields = buildRsvpFields(night);
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

function buildRsvpButtons(night: MovieNight, closed: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`rsvp:${night.id}:yes`).setLabel("Going").setEmoji("✅").setStyle(ButtonStyle.Success).setDisabled(closed),
    new ButtonBuilder().setCustomId(`rsvp:${night.id}:maybe`).setLabel("Maybe").setEmoji("🤔").setStyle(ButtonStyle.Secondary).setDisabled(closed),
    new ButtonBuilder().setCustomId(`rsvp:${night.id}:no`).setLabel("Can't go").setEmoji("✖️").setStyle(ButtonStyle.Danger).setDisabled(closed),
  );
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
    components: [buildRsvpButtons(night, closed), buildActionButtons(night, closed)],
  };
}
