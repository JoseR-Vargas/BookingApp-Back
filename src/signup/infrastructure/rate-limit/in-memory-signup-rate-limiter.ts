import { Clock } from '../../../shared/application/clock.port';
import { SignupRateLimiter } from '../../application/ports/signup-rate-limiter.port';

/** 5 signups per hour per key. */
export const DEFAULT_SIGNUP_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

/**
 * A sliding window per key, in the memory of the process. It is the minimum
 * the spec asks for: with several instances each one counts on its own, and a
 * restart forgets the counts.
 */
export class InMemorySignupRateLimiter implements SignupRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly clock: Clock,
    private readonly limit: {
      max: number;
      windowMs: number;
    } = DEFAULT_SIGNUP_LIMIT,
  ) {}

  tryConsume(key: string): boolean {
    const now = this.clock.now().getTime();
    const recent = (this.attempts.get(key) ?? []).filter(
      (at) => at > now - this.limit.windowMs,
    );
    if (recent.length >= this.limit.max) {
      this.attempts.set(key, recent);
      return false;
    }
    recent.push(now);
    this.attempts.set(key, recent);
    this.forgetOldKeys(now);
    return true;
  }

  /** Keeps the map from growing with every IP ever seen. */
  private forgetOldKeys(now: number): void {
    if (this.attempts.size < 1000) return;
    for (const [key, times] of this.attempts) {
      if (times.every((at) => at <= now - this.limit.windowMs)) {
        this.attempts.delete(key);
      }
    }
  }
}
