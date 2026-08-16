import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOT_CAPABILITIES } from "../src/assistant/capabilities.js";
import { TOOL_USE_INSTRUCTIONS } from "../src/assistant/system-prompt.js";

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
});
