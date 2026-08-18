import { GuildScheduledEventStatus } from "discord.js";
import { upcomingItems, type UpcomingItem } from "../../../assistant/event-data.js";
import { isMovieNightChannel } from "../../movie-night/channel-policy.js";
import type { VisibleEvent, VisibleEvents } from "./types.js";
import type { AssistantToolContext } from "../../../assistant/types.js";
import type { BotStore } from "../../../store.js";
import type { Client, Guild } from "discord.js";

async function discordItems(guild: Guild, store: BotStore): Promise<VisibleEvent[]> {
  const scheduled = await guild.scheduledEvents.fetch({ withUserCount: true });
  const localItems = upcomingItems(store, guild.id);
  const localByScheduledId = new Map<string, UpcomingItem>();

  for (const item of localItems) {
    const id =
      item.kind === "event"
        ? store.getEvent(item.ref.slice("event:".length))?.scheduledEventId
        : store.get(item.ref.slice("movie-night:".length))?.scheduledEventId;

    if (id) localByScheduledId.set(id, item);
  }

  return [...scheduled.values()]
    .filter(
      (event) =>
        (event.status === GuildScheduledEventStatus.Scheduled || event.status === GuildScheduledEventStatus.Active) &&
        event.scheduledStartTimestamp !== null,
    )
    .map((event) => {
      const local = localByScheduledId.get(event.id);
      const item: UpcomingItem = local
        ? { ...local, url: event.url, discordInterestedCount: event.userCount ?? undefined }
        : {
            ref: `discord-event:${event.id}`,
            kind: "event",
            guildId: guild.id,
            channelId: event.channelId ?? "",
            messageId: "",
            creatorId: event.creatorId ?? "",
            title: event.name,
            startsAt: Math.floor(event.scheduledStartTimestamp! / 1000),
            details: [event.description, event.entityMetadata?.location].filter(Boolean).join("\n") || undefined,
            rsvps: {},
            url: event.url,
            discordInterestedCount: event.userCount ?? undefined,
          };

      return { item, scheduled: event };
    })
    .sort((left, right) => left.item.startsAt - right.item.startsAt);
}

export function createVisibleEvents(client: Client, store: BotStore, movieNightsChannel: string): VisibleEvents {
  return async (context: AssistantToolContext): Promise<VisibleEvent[]> => {
    const channel = await client.channels.fetch(context.channelId);
    const inMovieChannel = Boolean(
      channel?.isTextBased() && !channel.isDMBased() && isMovieNightChannel(channel.name, movieNightsChannel),
    );
    const items = await discordItems(context.guild, store);

    return inMovieChannel ? items : items.filter(({ item }) => item.kind !== "movie-night");
  };
}
