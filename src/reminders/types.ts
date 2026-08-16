export interface EventReminder {
  id: string;
  guildId: string;
  channelId: string;
  creatorId: string;
  targetRef: string;
  sendAt: number;
  note?: string;
  createdAt: number;
}
