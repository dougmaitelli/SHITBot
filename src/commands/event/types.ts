import type { RsvpStatus } from "../movie-night/types.js";

export interface TimedEventSchedule {
  type: "timed";
  startsAt: number;
  endsAt: number;
}

export interface AllDayEventSchedule {
  type: "all-day";
  startsOn: string;
  endsOn: string;
  timeZone: string;
}

export type EventSchedule = TimedEventSchedule | AllDayEventSchedule;

export interface CommunityEvent {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  scheduledEventId?: string;
  creatorId: string;
  name: string;
  schedule: EventSchedule;
  description?: string;
  link?: string;
  attendanceLimit?: number;
  rsvps: Record<string, RsvpStatus>;
  createdAt: number;
  closedAt?: number;
}
