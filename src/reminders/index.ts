import type { Client } from "discord.js";
import { findUpcomingItem } from "../assistant/event-data.js";
import type { BotStore } from "../store.js";
import type { EventReminder } from "./types.js";

export async function sendReminder(client: Client, store: BotStore, reminder: EventReminder): Promise<void> {
  const item = findUpcomingItem(store, reminder.guildId, reminder.targetRef);
  if (!item) throw new Error("The event no longer exists or has already started.");
  const channel = await client.channels.fetch(reminder.channelId);
  if (!channel?.isTextBased() || !channel.isSendable()) throw new Error("The reminder channel is unavailable.");
  const postUrl = `https://discord.com/channels/${item.guildId}/${item.channelId}/${item.messageId}`;
  await channel.send({
    content: [
      `⏰ **Reminder: ${item.title}**`,
      `<t:${item.startsAt}:F> · <t:${item.startsAt}:R> · [View event post](${postUrl})`,
      reminder.note,
    ].filter(Boolean).join("\n"),
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
      if (!findUpcomingItem(store, reminder.guildId, reminder.targetRef)) await store.deleteReminder(reminder.id);
      console.error(`Could not send reminder ${reminder.id}`, error);
    }
  }
}

export function startReminderJob(client: Client, store: BotStore): NodeJS.Timeout {
  const run = () => void sendDueReminders(client, store).catch((error) => console.error("Could not process reminders", error));
  run();
  return setInterval(run, 30_000);
}
