import { createEventMessageService } from "../messages.js";
import { createEventAttendanceTool } from "./attendance.js";
import { createEventCreationTool } from "./create.js";
import { createVisibleEvents } from "./discord-items.js";
import { createEventEditTool } from "./edit.js";
import { createEventListTools } from "./list.js";
import { createEventReminderTool } from "./reminders.js";
import type { AssistantTool } from "../../../assistant/types.js";
import type { RoleConfig } from "../../../authorization.js";
import type { BotStore } from "../../../store.js";
import type { Client } from "discord.js";

export function createEventAssistantTools(
  client: Client,
  store: BotStore,
  timeZone: string,
  movieNightsChannel: string,
  roles: RoleConfig = { moderatorRoleId: "", adminRoleId: "" },
): AssistantTool[] {
  const visible = createVisibleEvents(client, store, movieNightsChannel);
  const dependencies = {
    client,
    store,
    timeZone,
    roles,
    messages: createEventMessageService(client),
    visible,
  };

  return [
    createEventCreationTool(dependencies),
    createEventEditTool(dependencies),
    ...createEventListTools(visible),
    createEventAttendanceTool(visible),
    createEventReminderTool(dependencies),
  ];
}
