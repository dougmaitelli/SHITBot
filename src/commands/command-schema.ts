import { SlashCommandBuilder, type RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";

interface BaseOptionSchema {
  name: string;
  description: string;
  required?: boolean;
}

interface StringOptionSchema extends BaseOptionSchema {
  type: "string";
  minLength?: number;
  maxLength?: number;
}

interface IntegerOptionSchema extends BaseOptionSchema {
  type: "integer";
  minValue?: number;
  maxValue?: number;
}

interface BooleanOptionSchema extends BaseOptionSchema {
  type: "boolean";
}

type CommandOptionSchema = StringOptionSchema | IntegerOptionSchema | BooleanOptionSchema;

interface SubcommandSchema {
  name: string;
  description: string;
  options?: CommandOptionSchema[];
}

interface CommandSchema {
  name: string;
  description: string;
  subcommands?: SubcommandSchema[];
}

export function buildCommand(schema: CommandSchema): RESTPostAPIChatInputApplicationCommandsJSONBody {
  const command = new SlashCommandBuilder().setName(schema.name).setDescription(schema.description);

  for (const subcommandSchema of schema.subcommands ?? []) {
    command.addSubcommand((subcommand) => {
      subcommand.setName(subcommandSchema.name).setDescription(subcommandSchema.description);

      for (const optionSchema of subcommandSchema.options ?? []) {
        if (optionSchema.type === "string") {
          subcommand.addStringOption((option) => {
            option
              .setName(optionSchema.name)
              .setDescription(optionSchema.description)
              .setRequired(optionSchema.required ?? false);

            if (optionSchema.minLength !== undefined) option.setMinLength(optionSchema.minLength);

            if (optionSchema.maxLength !== undefined) option.setMaxLength(optionSchema.maxLength);

            return option;
          });
        } else if (optionSchema.type === "integer") {
          subcommand.addIntegerOption((option) => {
            option
              .setName(optionSchema.name)
              .setDescription(optionSchema.description)
              .setRequired(optionSchema.required ?? false);

            if (optionSchema.minValue !== undefined) option.setMinValue(optionSchema.minValue);

            if (optionSchema.maxValue !== undefined) option.setMaxValue(optionSchema.maxValue);

            return option;
          });
        } else {
          subcommand.addBooleanOption((option) =>
            option
              .setName(optionSchema.name)
              .setDescription(optionSchema.description)
              .setRequired(optionSchema.required ?? false),
          );
        }
      }

      return subcommand;
    });
  }

  return command.toJSON();
}
