import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type APIEmbedField } from "discord.js";
import { buildRsvpButtons, buildRsvpFields } from "../../../shared/rsvp.js";
import { eventCalendarUrl } from "../calendar.js";
import { formatEventSchedule, isEventEnded } from "../schedule.js";
import type { CommunityEvent } from "../types.js";

export function renderEvent(event: CommunityEvent) {
  const closed = isEventEnded(event);
  const details: APIEmbedField[] = [];

  if (event.link) details.push({ name: "Link", value: `[Open link](${event.link})`, inline: true });

  if (event.scheduledEventId) {
    details.push({
      name: "Discord event",
      value: `[View event](https://discord.com/events/${event.guildId}/${event.scheduledEventId})`,
      inline: true,
    });
  }

  details.push({ name: "Calendar", value: `[Add to Google Calendar](${eventCalendarUrl(event)})`, inline: true });

  const embed = new EmbedBuilder()
    .setColor(closed ? 0x747f8d : 0x5865f2)
    .setTitle(`📅 ${event.name}`)
    .setDescription(
      event.description
        ? `${event.description}\n\nOrganized by <@${event.creatorId}>`
        : `Organized by <@${event.creatorId}>`,
    )
    .addFields(
      {
        name: "When",
        value:
          event.schedule.type === "timed"
            ? `${formatEventSchedule(event.schedule)}\n<t:${event.schedule.startsAt}:R>`
            : formatEventSchedule(event.schedule),
        inline: true,
      },
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
