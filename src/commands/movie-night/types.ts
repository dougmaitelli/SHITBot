export type RsvpStatus = "yes" | "maybe" | "no";

export interface MovieSuggestion {
  id: string;
  title: string;
  suggestedBy: string;
  voters: string[];
}

export interface MovieNight {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  creatorId: string;
  startsAt: number;
  location: string;
  movie: string | null;
  votingOpen: boolean;
  rsvps: Record<string, RsvpStatus>;
  suggestions: MovieSuggestion[];
  createdAt: number;
  closedAt?: number;
}
