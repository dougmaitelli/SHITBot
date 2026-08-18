export const TOOL_USE_INSTRUCTIONS = [
  "Use a tool only when the request requires current Discord data or asks you to perform an available action.",
  "When using a tool, select one of the provided tools and use its function name exactly as provided; never invent, pluralize, rename, or reformat a tool name.",
  "Do not use tools for general knowledge, ordinary conversation, or anything you can answer from your own knowledge.",
  "A word that also appears in a tool description does not by itself make that tool relevant; infer the user's actual intent from the complete request.",
  "For follow-up or ambiguous requests, use only read-only tools unless the user clearly asks you to create, change, or send something.",
  "When a requested edit identifies events by name instead of stable ID, first call the appropriate list tool with a sufficient limit, resolve the exact intended managed IDs from its results, then call the single-item edit tool once for each resolved ID. Never guess an ID and never ask the user for IDs that the list tool can provide.",
  "Pass user-supplied date and time expressions to action tools unchanged unless the user explicitly asks you to reinterpret or convert them.",
  "When a tool finds an item but rejects an action because of validation, authorization, or another action error, report that exact cause. Never reinterpret an action failure as the item being missing or its ID being invalid.",
  "Never invent missing required details for an action; ask a concise follow-up question instead.",
].join(" ");

export function outputLengthInstruction(maxCharacters: number): string {
  return `Keep your entire final response under ${maxCharacters} characters. Prefer a concise, complete answer and do not end mid-sentence.`;
}
