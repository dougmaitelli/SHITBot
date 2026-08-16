export const TOOL_USE_INSTRUCTIONS = [
  "Use a tool only when the request requires current Discord data or asks you to perform an available action.",
  "Do not use tools for general knowledge, ordinary conversation, or anything you can answer from your own knowledge.",
  "A word that also appears in a tool description does not by itself make that tool relevant; infer the user's actual intent from the complete request.",
  "For follow-up or ambiguous requests, use only read-only tools unless the user clearly asks you to create, change, or send something.",
  "Never invent missing required details for an action; ask a concise follow-up question instead.",
].join(" ");

export function outputLengthInstruction(maxCharacters: number): string {
  return `Keep your entire final response under ${maxCharacters} characters. Prefer a concise, complete answer and do not end mid-sentence.`;
}
