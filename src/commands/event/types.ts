import type { RsvpStatus } from "../movie-night/types.js";

export interface CommunityEvent {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  scheduledEventId?: string;
  creatorId: string;
  name: string;
  startsAt: number;
  durationMinutes?: number;
  endsAt?: number;
  fullDay?: boolean;
  description?: string;
  link?: string;
  attendanceLimit?: number;
  rsvps: Record<string, RsvpStatus>;
  createdAt: number;
  closedAt?: number;
}
