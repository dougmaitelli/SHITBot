import type { RsvpStatus } from "../../shared/rsvp.js";

export type { RsvpStatus } from "../../shared/rsvp.js";

export interface MovieSuggestion {
  id: string;
  title: string;
  releaseYear?: number;
  tmdbId?: number;
  imdbId?: string;
  description?: string;
  posterUrl?: string;
  rating?: number;
  messageId?: string;
  suggestedBy: string;
  voters: string[];
}

export interface MovieNight {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  scheduledEventId?: string;
  creatorId: string;
  startsAt: number;
  location: string;
  movie: string | null;
  votingOpen: boolean;
  attendanceLimit?: number;
  rsvps: Record<string, RsvpStatus>;
  suggestions: MovieSuggestion[];
  createdAt: number;
  closedAt?: number;
}
