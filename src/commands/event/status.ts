import { isEventEnded } from "./schedule.js";
import type { CommunityEvent } from "./types.js";

export function isEventClosed(event: CommunityEvent): boolean {
  return isEventEnded(event);
}
