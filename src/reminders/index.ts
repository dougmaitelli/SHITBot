import { findUpcomingItem } from "../assistant/event-data.js";
import { logger } from "../logger.js";
import type { BotStore } from "../store.js";
import type { EventReminder } from "./types.js";
import type { UpcomingItem } from "../assistant/event-data.js";
import type { Client } from "discord.js";

async function resolveReminderItem(
  client: Client,
  store: BotStore,
  reminder: EventReminder,
): Promise<UpcomingItem | undefined> {
  const local = findUpcomingItem(store, reminder.guildId, reminder.targetRef);
  if (local) return local;
  const match = /^discord-event:(\d+)$/.exec(reminder.targetRef);
  if (!match?.[1]) return undefined;
  try {
    const guild = await client.guilds.fetch(reminder.guildId);
    const event = await guild.scheduledEvents.fetch({ guildScheduledEvent: match[1], withUserCount: true });
    if (!event.scheduledStartTimestamp || event.isCanceled() || event.isCompleted()) return undefined;
    return {
      ref: reminder.targetRef,
      kind: "event",
      guildId: reminder.guildId,
      channelId: event.channelId ?? "",
      messageId: "",
      creatorId: event.creatorId ?? "",
      title: event.name,
      startsAt: Math.floor(event.scheduledStartTimestamp / 1000),
      details: event.description ?? undefined,
      rsvps: {},
      url: event.url,
      discordInterestedCount: event.userCount ?? undefined,
    };
  } catch {
    return undefined;
  }
}

export async function sendReminder(client: Client, store: BotStore, reminder: EventReminder): Promise<void> {
  const item = await resolveReminderItem(client, store, reminder);
  if (!item) throw new Error("The event no longer exists or has already started.");
  const channel = await client.channels.fetch(reminder.channelId);
  if (!channel?.isTextBased() || !channel.isSendable()) throw new Error("The reminder channel is unavailable.");
  const postUrl = item.url ?? `https://discord.com/channels/${item.guildId}/${item.channelId}/${item.messageId}`;
  await channel.send({
    content: [
      `⏰ **Reminder: ${item.title}**`,
      `<t:${item.startsAt}:F> · <t:${item.startsAt}:R> · [View event post](${postUrl})`,
      reminder.note,
    ]
      .filter(Boolean)
      .join("\n"),
    allowedMentions: { parse: [] },
  });
}

export async function sendDueReminders(client: Client, store: BotStore): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  for (const reminder of store.listReminders().filter((item) => item.sendAt <= now)) {
    try {
      await sendReminder(client, store, reminder);
      await store.deleteReminder(reminder.id);
    } catch (error) {
      if (!(await resolveReminderItem(client, store, reminder))) await store.deleteReminder(reminder.id);
      logger.error("Could not send reminder", {
        error,
        reminderId: reminder.id,
        guildId: reminder.guildId,
        channelId: reminder.channelId,
      });
    }
  }
}

export function startReminderJob(client: Client, store: BotStore): NodeJS.Timeout {
  const run = () =>
    void sendDueReminders(client, store).catch((error) => logger.error("Could not process reminders", { error }));
  run();
  return setInterval(run, 30_000);
}
