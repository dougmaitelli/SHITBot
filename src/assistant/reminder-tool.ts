import { randomUUID } from "node:crypto";
import { sendReminder } from "../reminders/index.js";
import { parseDate } from "../utils/date-parser.js";
import type { EventReminder } from "../reminders/types.js";
import type { BotStore } from "../store.js";
import type { UpcomingItem } from "./event-data.js";
import type { AssistantToolContext } from "./types.js";
import type { Client } from "discord.js";

export interface ReminderArguments {
  when?: string;
  message?: string;
}

export function parseReminderArguments(input: Record<string, unknown>): ReminderArguments {
  if (input.when !== undefined && typeof input.when !== "string") throw new Error("when must be text.");
  if (input.message !== undefined && typeof input.message !== "string") throw new Error("message must be text.");
  return input;
}

export async function createReminder(
  client: Client,
  store: BotStore,
  context: AssistantToolContext,
  item: UpcomingItem,
  input: ReminderArguments,
  timeZone: string,
): Promise<string> {
  if (item.creatorId !== context.userId) throw new Error("Only the organizer can create a public reminder.");
  const note = input.message?.trim() || undefined;
  if (note && note.length > 1000) throw new Error("The reminder message must be at most 1000 characters.");
  const now = Math.floor(Date.now() / 1000);
  let sendAt = now;
  if (input.when) {
    const parsed = parseDate(input.when, timeZone);
    if (!parsed) throw new Error("I couldn't understand the reminder date and time.");
    if (parsed <= now) throw new Error("A scheduled reminder must be in the future. Omit when to post it now.");
    if (parsed >= item.startsAt) throw new Error("The reminder must be scheduled before the event starts.");
    sendAt = parsed;
  }
  const reminder: EventReminder = {
    id: randomUUID().slice(0, 8),
    guildId: context.guild.id,
    channelId: context.channelId,
    creatorId: context.userId,
    targetRef: item.ref,
    sendAt,
    note,
    createdAt: Date.now(),
  };
  if (!input.when) {
    await sendReminder(client, store, reminder);
    return `Posted a reminder for **${item.title}** in <#${context.channelId}>.`;
  }
  const active = store.listReminders().filter((candidate) => candidate.creatorId === context.userId);
  if (active.length >= 10) throw new Error("You already have 10 scheduled reminders.");
  if (active.some((candidate) => candidate.targetRef === reminder.targetRef && candidate.sendAt === reminder.sendAt)) {
    throw new Error("That reminder is already scheduled.");
  }
  await store.setReminder(reminder);
  return `Scheduled a reminder for **${item.title}** at <t:${sendAt}:F> in <#${context.channelId}>.`;
}
