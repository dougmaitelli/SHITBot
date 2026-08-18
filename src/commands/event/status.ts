import type { CommunityEvent } from "./types.js";

export function isEventClosed(event: CommunityEvent): boolean {
  return Boolean(event.closedAt) || event.startsAt <= Math.floor(Date.now() / 1000);
}
