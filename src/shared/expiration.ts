export interface Expirable {
  id: string;
  startsAt: number;
  closedAt?: number;
}

interface ExpirationOptions<T extends Expirable> {
  list: () => T[];
  save: (item: T) => Promise<void>;
  updateMessage: (item: T) => Promise<void>;
  itemName: string;
  intervalMs?: number;
}

export async function closeExpired<T extends Expirable>(options: ExpirationOptions<T>): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  for (const item of options.list().filter((candidate) => !candidate.closedAt && candidate.startsAt <= now)) {
    item.closedAt = Date.now();
    await options.save(item);
    await options.updateMessage(item).catch((error) =>
      console.error(`Could not update closed ${options.itemName} ${item.id}`, error),
    );
  }
}

export function startExpirationJob<T extends Expirable>(options: ExpirationOptions<T>): NodeJS.Timeout {
  const run = () => void closeExpired(options).catch((error) =>
    console.error(`Could not close expired ${options.itemName}s`, error),
  );
  run();
  return setInterval(run, options.intervalMs ?? 30_000);
}
