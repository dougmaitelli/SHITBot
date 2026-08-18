import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import type { MovieNight, MovieSuggestion } from "../types.js";

function isClosed(night: MovieNight): boolean {
  return Boolean(night.closedAt) || night.startsAt <= Math.floor(Date.now() / 1000);
}

function displayTitle(suggestion: MovieSuggestion): string {
  return `${suggestion.title}${suggestion.releaseYear ? ` (${suggestion.releaseYear})` : ""}`;
}

export function renderSuggestion(night: MovieNight, suggestion: MovieSuggestion) {
  const embed = new EmbedBuilder()
    .setColor(0x01b4e4)
    .setTitle(displayTitle(suggestion).slice(0, 256))
    .setDescription((suggestion.description || "No description is available for this movie.").slice(0, 4096))
    .addFields(
      { name: "Year", value: suggestion.releaseYear?.toString() ?? "Unknown", inline: true },
      {
        name: "TMDB rating",
        value: suggestion.rating ? `${suggestion.rating.toFixed(1)}/10` : "Not rated",
        inline: true,
      },
      { name: "Votes", value: suggestion.voters.length.toString(), inline: true },
      { name: "Suggested by", value: `<@${suggestion.suggestedBy}>`, inline: true },
    )
    .setFooter({
      text: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    });

  if (suggestion.imdbId) embed.setURL(`https://www.imdb.com/title/${suggestion.imdbId}/`);

  if (suggestion.posterUrl) embed.setThumbnail(suggestion.posterUrl);

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`deleteSuggestion:${night.id}:${suggestion.id}`)
      .setLabel("Delete suggestion")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isClosed(night)),
  );

  return { embeds: [embed], components: [buttons] };
}
