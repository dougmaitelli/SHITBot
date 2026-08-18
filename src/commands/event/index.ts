import { buildCommand } from "../command-schema.js";
import { createEventAssistantTools } from "./assistant-tools/index.js";
import { startExpirationJob } from "./expiration-job.js";
import { createEventInteractionHandler } from "./interactions/index.js";
import { createEventMessageService } from "./messages.js";
import { createEventHandler, createEventSchema } from "./subcommands/create.js";
import { editEventHandler, editEventSchema } from "./subcommands/edit.js";
import { importEventHandler, importEventSchema } from "./subcommands/import.js";
import type { CommandFactory, CommandModule, GuildCommandInteraction } from "../types.js";

const createEventCommand: CommandFactory = (context): CommandModule => {
  const { client, store, config } = context;
  const messages = createEventMessageService(client);
  const subcommands = new Map([
    ["create", createEventHandler(context)],
    ["import", importEventHandler(context)],
    ["edit", editEventHandler(context, messages)],
  ]);

  context.registerAssistantTools(
    ...createEventAssistantTools(client, store, config.timeZone, config.movieNightsChannel, config.roles),
  );

  return {
    data: buildCommand({
      name: "event",
      description: "Organize an event",
      subcommands: [createEventSchema, importEventSchema, editEventSchema],
    }),
    async execute(interaction: GuildCommandInteraction): Promise<void> {
      await subcommands.get(interaction.options.getSubcommand())?.(interaction);
    },
    handleInteraction: createEventInteractionHandler(context, messages),
    onReady(): void {
      startExpirationJob(store, (event) => messages.update(event));
    },
  };
};

export default createEventCommand;
