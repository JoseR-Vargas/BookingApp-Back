import { Global, Module } from '@nestjs/common';
import { PUBLIC_RATE_LIMITER } from '../../application/rate-limiter.port';
import { SystemClock } from '../system.clock';
import { SlidingWindowRateLimiter } from './sliding-window-rate-limiter';

/** 120 requests per minute per IP on the public routes (spec 22). */
export const DEFAULT_PUBLIC_RATE_LIMIT = { max: 120, windowMs: 60_000 };

/** `PUBLIC_RATE_LIMIT_PER_MINUTE` overrides the 120 (tests, staging). Read at the edge. */
export function publicRateLimit(
  env: string | undefined = process.env.PUBLIC_RATE_LIMIT_PER_MINUTE,
) {
  const max = Number(env);
  return {
    ...DEFAULT_PUBLIC_RATE_LIMIT,
    max: Number.isInteger(max) && max > 0 ? max : DEFAULT_PUBLIC_RATE_LIMIT.max,
  };
}

/**
 * One limiter for the whole process, so the three public routes count
 * against the same per-IP budget.
 */
@Global()
@Module({
  providers: [
    {
      provide: PUBLIC_RATE_LIMITER,
      useFactory: () =>
        new SlidingWindowRateLimiter(new SystemClock(), publicRateLimit()),
    },
  ],
  exports: [PUBLIC_RATE_LIMITER],
})
export class PublicRateLimitModule {}
