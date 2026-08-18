import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type APIEmbedField } from "discord.js";
import { buildRsvpButtons, buildRsvpFields } from "../../shared/rsvp.js";
import type { CommunityEvent } from "./types.js";

function isClosed(event: CommunityEvent): boolean {
  return Boolean(event.closedAt) || event.startsAt <= Math.floor(Date.now() / 1000);
}

export function renderEvent(event: CommunityEvent) {
  const closed = isClosed(event);
  const details: APIEmbedField[] = [];

  if (event.link) details.push({ name: "Link", value: `[Open link](${event.link})`, inline: true });

  if (event.scheduledEventId) {
    details.push({
      name: "Discord event",
      value: `[View event](https://discord.com/events/${event.guildId}/${event.scheduledEventId})`,
      inline: true,
    });
  }

  const when = event.fullDay
    ? event.endsAt
      ? `<t:${event.startsAt}:D> – <t:${event.endsAt - 1}:D> (all day)`
      : `<t:${event.startsAt}:D> (all day)`
    : event.endsAt
      ? `<t:${event.startsAt}:F> – <t:${event.endsAt}:F>\n<t:${event.startsAt}:R>`
      : `<t:${event.startsAt}:F>\n<t:${event.startsAt}:R>`;
  const embed = new EmbedBuilder()
    .setColor(closed ? 0x747f8d : 0x5865f2)
    .setTitle(`📅 ${event.name}`)
    .setDescription(
      event.description
        ? `${event.description}\n\nOrganized by <@${event.creatorId}>`
        : `Organized by <@${event.creatorId}>`,
    )
    .addFields(
      { name: "When", value: when, inline: true },
      ...details,
      ...buildRsvpFields(event.rsvps, event.attendanceLimit),
    )
    .setFooter({ text: closed ? "This event is closed" : "RSVP below" });

  const rsvps = buildRsvpButtons(event.id, "eventRsvp", closed);
  const actions = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`eventDelete:${event.id}`)
      .setLabel("Delete event")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [rsvps, actions] };
}
