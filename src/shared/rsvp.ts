import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type APIEmbedField } from "discord.js";

export type RsvpStatus = "yes" | "maybe" | "no";
export type Rsvps = Record<string, RsvpStatus>;

const statuses: RsvpStatus[] = ["yes", "maybe", "no"];
const labels: Record<RsvpStatus, string> = { yes: "Going", maybe: "Maybe", no: "Can't go" };
const styles: Record<RsvpStatus, ButtonStyle> = {
  yes: ButtonStyle.Success,
  maybe: ButtonStyle.Secondary,
  no: ButtonStyle.Danger,
};
const emojis: Record<RsvpStatus, string> = { yes: "✅", maybe: "🤔", no: "✖️" };

export function setRsvp(rsvps: Rsvps, userId: string, status: RsvpStatus, attendanceLimit?: number): boolean {
  const alreadyGoing = rsvps[userId] === "yes";
  const goingCount = Object.values(rsvps).filter((value) => value === "yes").length;
  if (status === "yes" && !alreadyGoing && attendanceLimit !== undefined && goingCount >= attendanceLimit) {
    return false;
  }
  rsvps[userId] = status;
  return true;
}

export function buildRsvpFields(rsvps: Rsvps, attendanceLimit?: number): APIEmbedField[] {
  return statuses.map((status) => {
    const users = Object.entries(rsvps)
      .filter(([, value]) => value === status)
      .map(([id]) => `<@${id}>`);
    const mentions = users.length ? users.join(", ") : "Nobody yet";
    return {
      name: `${labels[status]} (${users.length}${status === "yes" && attendanceLimit !== undefined ? ` / ${attendanceLimit}` : ""})`,
      value: mentions.length > 1024 ? `${mentions.slice(0, 1021)}...` : mentions,
      inline: true,
    };
  });
}

export function buildRsvpButtons(id: string, action: string, disabled: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...statuses.map((status) =>
      new ButtonBuilder()
        .setCustomId(`${action}:${id}:${status}`)
        .setLabel(labels[status])
        .setEmoji(emojis[status])
        .setStyle(styles[status])
        .setDisabled(disabled),
    ),
  );
}
