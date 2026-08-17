import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApplicationCommandOptionType } from "discord.js";
import { buildCommand } from "../../src/commands/command-schema.js";

describe("command schema", () => {
  it("builds typed subcommands and constrained options", () => {
    const command = buildCommand({
      name: "event",
      description: "Organize an event",
      subcommands: [
        {
          name: "create",
          description: "Create an event",
          options: [
            {
              type: "string",
              name: "name",
              description: "Event name",
              required: true,
              maxLength: 100,
            },
            {
              type: "integer",
              name: "limit",
              description: "Attendance limit",
              minValue: 1,
              maxValue: 100,
            },
          ],
        },
      ],
    });

    assert.equal(command.options?.[0]?.type, ApplicationCommandOptionType.Subcommand);
    const [name, limit] = command.options?.[0]?.options ?? [];

    assert.equal(name?.type, ApplicationCommandOptionType.String);
    assert.equal(name?.name, "name");
    assert.equal(name?.required, true);
    assert.equal("max_length" in (name ?? {}) ? name.max_length : undefined, 100);

    assert.equal(limit?.type, ApplicationCommandOptionType.Integer);
    assert.equal(limit?.name, "limit");
    assert.equal(limit?.required, false);
    assert.equal("min_value" in (limit ?? {}) ? limit.min_value : undefined, 1);
    assert.equal("max_value" in (limit ?? {}) ? limit.max_value : undefined, 100);
  });
});
