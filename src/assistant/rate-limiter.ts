interface Bucket {
  count: number;
  resetsAt: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private nextSweepAt = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  consume(key: string, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
    if (now >= this.nextSweepAt) {
      for (const [bucketKey, bucket] of this.buckets) {
        if (bucket.resetsAt <= now) this.buckets.delete(bucketKey);
      }
      this.nextSweepAt = now + this.windowMs;
    }
    const current = this.buckets.get(key);
    if (!current || current.resetsAt <= now) {
      this.buckets.set(key, { count: 1, resetsAt: now + this.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (current.count >= this.limit) return { allowed: false, retryAfterMs: current.resetsAt - now };
    current.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }
}
