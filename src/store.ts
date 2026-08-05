import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { MovieNight } from "./commands/movie-night/types.js";

interface StoreData {
  nights: Record<string, MovieNight>;
  greaseLastUsedAt?: number;
}

export class BotStore {
  private data: StoreData = { nights: {} };
  private saveQueue = Promise.resolve();

  constructor(private readonly filename: string) {}

  async load(): Promise<void> {
    try {
      this.data = JSON.parse(await readFile(this.filename, "utf8")) as StoreData;
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
