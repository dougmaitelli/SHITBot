import { MessageFlags, type Interaction } from "discord.js";
import { isEventClosed } from "../status.js";
import { deleteEvent } from "./delete.js";
import { handleEventRsvp } from "./rsvp.js";
import type { CommandContext } from "../../types.js";
import type { EventMessageService } from "../messages.js";

const actions = new Set(["eventRsvp", "eventDelete"]);

export function createEventInteractionHandler(context: CommandContext, messages: EventMessageService) {
  return async (interaction: Interaction): Promise<boolean> => {
    if (!interaction.isButton()) return false;

    const [action, eventId, value] = interaction.customId.split(":");

    if (!action || !actions.has(action)) return false;

    const event = eventId ? context.store.getEvent(eventId) : undefined;

    if (!event) {
      await interaction.reply({
        content: "I couldn't find that event. It may have been removed.",
        flags: MessageFlags.Ephemeral,
      });

      return true;
    }

    if (isEventClosed(event) && action !== "eventDelete") {
      if (!event.closedAt) {
        event.closedAt = Date.now();
        await context.store.setEvent(event);
        await messages.update(event).catch(() => undefined);
      }

      await interaction.reply({
        content: "This event has started and is no longer editable.",
        flags: MessageFlags.Ephemeral,
      });

      return true;
    }

    if (action === "eventRsvp" && (value === "yes" || value === "maybe" || value === "no"))
      await handleEventRsvp(context.store, interaction, event, value);
    else if (action === "eventDelete") await deleteEvent(context, interaction, event);

    return true;
  };
}
