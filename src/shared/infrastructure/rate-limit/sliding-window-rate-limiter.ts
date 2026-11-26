import { Clock } from '../../application/clock.port';
import { RateLimiter } from '../../application/rate-limiter.port';

export interface RateLimit {
  /** Attempts allowed per window and key. */
  max: number;
  windowMs: number;
}

/**
 * A sliding window per key, in the memory of the process. With several
 * instances each one counts on its own and a restart forgets the counts.
 * Keys whose attempts all left the window are swept at most once per window,
 * so the map never grows with every IP ever seen.
 */
export class SlidingWindowRateLimiter implements RateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private lastSweep: number | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly limit: RateLimit,
  ) {}

  tryConsume(key: string): boolean {
    const now = this.clock.now().getTime();
    this.sweep(now);
    const recent = (this.attempts.get(key) ?? []).filter(
      (at) => at > now - this.limit.windowMs,
    );
    const allowed = recent.length < this.limit.max;
    if (allowed) recent.push(now);
    this.attempts.set(key, recent);
    return allowed;
  }

  /** How many keys are remembered (for tests). */
  trackedKeys(): number {
    return this.attempts.size;
  }

  private sweep(now: number): void {
    if (this.lastSweep !== null && now - this.lastSweep < this.limit.windowMs) {
      return;
    }
    this.lastSweep = now;
    for (const [key, times] of this.attempts) {
      if (times.every((at) => at <= now - this.limit.windowMs)) {
        this.attempts.delete(key);
      }
    }
  }
}
