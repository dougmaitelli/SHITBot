import { upcomingItems } from "../../../assistant/event-data.js";
import { createMovieNightMessageService } from "../messages.js";
import { createMovieNightAttendanceTool } from "./attendance.js";
import { createMovieNightCreationTool } from "./create.js";
import { createMovieNightEditTool } from "./edit.js";
import { createMovieNightListTools } from "./list.js";
import { createMovieNightReminderTool } from "./reminders.js";
import { createMovieNightSuggestionTools } from "./suggestions.js";
import type { RequireMovieChannel } from "./types.js";
import type { AssistantTool, AssistantToolContext } from "../../../assistant/types.js";
import type { RoleConfig } from "../../../authorization.js";
import type { BotStore } from "../../../store.js";
import type { TmdbClient } from "../tmdb.js";
import type { Client } from "discord.js";

export function createMovieNightAssistantTools(
  client: Client,
  store: BotStore,
  timeZone: string,
  requireMovieChannel: RequireMovieChannel,
  channelName = "movie-nights",
  tmdb?: TmdbClient,
  roles: RoleConfig = { moderatorRoleId: "", adminRoleId: "" },
): AssistantTool[] {
  const availableInMovieChannel = async (context: AssistantToolContext) => {
    try {
      await requireMovieChannel(context.channelId);

      return true;
    } catch {
      return false;
    }
  };
  const dependencies = {
    client,
    store,
    timeZone,
    requireMovieChannel,
    channelName,
    tmdb,
    roles,
    messages: createMovieNightMessageService(client),
    nights: (guildId: string) => upcomingItems(store, guildId).filter((item) => item.kind === "movie-night"),
    availableInMovieChannel,
  };

  return [
    createMovieNightCreationTool(dependencies),
    createMovieNightEditTool(dependencies),
    ...createMovieNightSuggestionTools(dependencies),
    ...createMovieNightListTools(dependencies),
    createMovieNightAttendanceTool(dependencies),
    createMovieNightReminderTool(dependencies),
  ];
}
