const creationRequest =
  /\b(?:write|generate|produce|create|build|implement|debug|fix|refactor|review|convert|translate|explain)\b[\s\S]{0,80}\b(?:code|source code|script|program|function|class|regex|regular expression|sql query|website|web app|application|discord bot|file|document|spreadsheet|presentation)\b/i;
const executionRequest =
  /\b(?:run|execute|compile|deploy|install)\b[\s\S]{0,60}\b(?:command|shell|terminal|bash|powershell|python|javascript|code|script|sql|package|dependency)\b/i;
const fileRequest =
  /\b(?:open|read|analyze|summarize|edit|modify|convert|upload|download|create|write|generate)\b[\s\S]{0,60}\b(?:attached|attachment|file|pdf|document|spreadsheet|presentation|archive|image)\b/i;
const secretRequest =
  /\b(?:show|reveal|print|give|send|leak|expose|repeat|ignore)\b[\s\S]{0,80}\b(?:system prompt|developer message|hidden instruction|api key|access token|environment variable|secret|credentials)\b/i;
const artifactRequest =
  /\b(?:write|generate|compose|draft|create|produce)\b[\s\S]{0,60}\b(?:poem|story|lyrics|song|essay|article|blog post|email|resume|cover letter|advertisement|marketing copy|image|video|audio)\b/i;

export function isAllowedAssistantRequest(prompt: string, hasAttachments = false): boolean {
  if (hasAttachments) return false;

  return (
    !creationRequest.test(prompt) &&
    !executionRequest.test(prompt) &&
    !fileRequest.test(prompt) &&
    !secretRequest.test(prompt) &&
    !artifactRequest.test(prompt)
  );
}

export const REJECTED_REQUEST_MESSAGE =
  "I can help with general knowledge and this server's events, but I can't create or work with code, files, commands, or executable content.";
