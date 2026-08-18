import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CommunityEvent } from "./commands/event/types.js";
import type { MovieNight } from "./commands/movie-night/types.js";
import type { EventReminder } from "./reminders/types.js";

interface StoreData {
  schemaVersion: 2;
  nights: Record<string, MovieNight>;
  events: Record<string, CommunityEvent>;
  reminders: Record<string, EventReminder>;
  greaseLastUsedAt?: number;
}

export class BotStore {
  private data: StoreData = { schemaVersion: 2, nights: {}, events: {}, reminders: {} };
  private saveQueue = Promise.resolve();

  constructor(private readonly filename: string) {}

  async load(): Promise<void> {
    try {
      const saved = JSON.parse(await readFile(this.filename, "utf8")) as Partial<StoreData>;

      this.data = {
        schemaVersion: 2,
        nights: saved.nights ?? {},
        events: saved.events ?? {},
        reminders: saved.reminders ?? {},
        greaseLastUsedAt: saved.greaseLastUsedAt,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;

      await this.save();
    }
  }

  get(id: string): MovieNight | undefined {
    return this.data.nights[id];
  }

  list(): MovieNight[] {
    return Object.values(this.data.nights);
  }

  set(night: MovieNight): Promise<void> {
    this.data.nights[night.id] = night;

    return this.save();
  }

  delete(id: string): Promise<void> {
    delete this.data.nights[id];

    return this.save();
  }

  getEvent(id: string): CommunityEvent | undefined {
    return this.data.events[id];
  }

  listEvents(): CommunityEvent[] {
    return Object.values(this.data.events);
  }

  setEvent(event: CommunityEvent): Promise<void> {
    this.data.events[event.id] = event;

    return this.save();
  }

  deleteEvent(id: string): Promise<void> {
    delete this.data.events[id];

    return this.save();
  }

  listReminders(): EventReminder[] {
    return Object.values(this.data.reminders);
  }

  setReminder(reminder: EventReminder): Promise<void> {
    this.data.reminders[reminder.id] = reminder;

    return this.save();
  }

  deleteReminder(id: string): Promise<void> {
    delete this.data.reminders[id];

    return this.save();
  }

  getGreaseLastUsedAt(): number | undefined {
    return this.data.greaseLastUsedAt;
  }

  async setGreaseLastUsedAt(timestamp: number): Promise<void> {
    this.data.greaseLastUsedAt = timestamp;
    await this.save();
  }

  private save(): Promise<void> {
    this.saveQueue = this.saveQueue.then(async () => {
      await mkdir(dirname(this.filename), { recursive: true });
      const temporary = `${this.filename}.tmp`;

      await writeFile(temporary, JSON.stringify(this.data, null, 2), "utf8");
      await rename(temporary, this.filename);
    });

    return this.saveQueue;
  }
}
