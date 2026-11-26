import { Clock } from '../../../shared/application/clock.port';
import {
  RateLimit,
  SlidingWindowRateLimiter,
} from '../../../shared/infrastructure/rate-limit/sliding-window-rate-limiter';
import { SignupRateLimiter } from '../../application/ports/signup-rate-limiter.port';

/** 5 signups per hour per key. */
export const DEFAULT_SIGNUP_LIMIT: RateLimit = {
  max: 5,
  windowMs: 60 * 60 * 1000,
};

/**
 * The signup limiter: the shared sliding window (spec 22) with the limit of
 * spec 21. With several instances each one counts on its own.
 */
export class InMemorySignupRateLimiter implements SignupRateLimiter {
  private readonly window: SlidingWindowRateLimiter;

  constructor(clock: Clock, limit: RateLimit = DEFAULT_SIGNUP_LIMIT) {
    this.window = new SlidingWindowRateLimiter(clock, limit);
  }

  tryConsume(key: string): boolean {
    return this.window.tryConsume(key);
  }
}
