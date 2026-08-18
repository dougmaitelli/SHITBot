import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOT_CAPABILITIES } from "../../src/assistant/capabilities.js";
import { outputLengthInstruction, TOOL_USE_INSTRUCTIONS } from "../../src/assistant/system-prompt.js";

describe("assistant capability catalog", () => {
  it("covers every mention-based workflow without advertising commands", () => {
    for (const capability of [
      "Create a general event",
      "Create a movie night",
      "List and summarize all upcoming",
      "Summarize Discord Interested",
      "schedule a persistent reminder",
      "Search TMDB",
      "Summarize an upcoming movie night's suggestions",
    ]) {
      assert.match(BOT_CAPABILITIES, new RegExp(capability.replaceAll("/", "\\/"), "i"));
    }

    assert.doesNotMatch(BOT_CAPABILITIES, /\/event|\/movie-night|\/grease/i);
  });
});

describe("assistant tool-use instructions", () => {
  it("reserves tools for current Discord data and actions", () => {
    assert.match(TOOL_USE_INSTRUCTIONS, /only when.*current Discord data.*action/i);
    assert.match(TOOL_USE_INSTRUCTIONS, /Do not use tools for general knowledge/i);
    assert.match(TOOL_USE_INSTRUCTIONS, /ambiguous requests.*read-only tools/i);
    assert.match(TOOL_USE_INSTRUCTIONS, /complete request/i);
  });

  it("requires exact provided tool names", () => {
    assert.match(TOOL_USE_INSTRUCTIONS, /function name exactly as provided/i);
    assert.match(TOOL_USE_INSTRUCTIONS, /never invent, pluralize, rename, or reformat/i);
  });

  it("resolves named edit targets through list tools before editing by ID", () => {
    assert.match(TOOL_USE_INSTRUCTIONS, /edit identifies events by name.*first call.*list tool/i);
    assert.match(TOOL_USE_INSTRUCTIONS, /edit tool once for each resolved ID/i);
    assert.match(TOOL_USE_INSTRUCTIONS, /never ask the user for IDs.*list tool can provide/i);
  });

  it("preserves the actual cause of action failures", () => {
    assert.match(TOOL_USE_INSTRUCTIONS, /date and time expressions.*unchanged/i);
    assert.match(TOOL_USE_INSTRUCTIONS, /validation, authorization.*exact cause/i);
    assert.match(TOOL_USE_INSTRUCTIONS, /Never reinterpret an action failure.*missing.*ID.*invalid/i);
  });

  it("treats first-person attendance requests as belonging to the requester", () => {
    assert.match(TOOL_USE_INSTRUCTIONS, /I, me, and my.*requesting Discord user.*never.*bot/i);
    assert.match(TOOL_USE_INSTRUCTIONS, /which events or movie nights.*list_my_upcoming_events/i);
    assert.match(TOOL_USE_INSTRUCTIONS, /requester-filtered results.*second person/i);
    assert.match(TOOL_USE_INSTRUCTIONS, /never say.*bot.*attending/i);
  });

  it("instructs the model to finish within the configured output limit", () => {
    const instruction = outputLengthInstruction(1600);

    assert.match(instruction, /under 1600 characters/i);
    assert.match(instruction, /complete answer/i);
    assert.match(instruction, /do not end mid-sentence/i);
  });
});
