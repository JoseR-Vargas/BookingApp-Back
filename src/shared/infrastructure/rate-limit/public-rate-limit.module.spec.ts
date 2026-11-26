import {
  DEFAULT_PUBLIC_RATE_LIMIT,
  publicRateLimit,
} from './public-rate-limit.module';

describe('publicRateLimit', () => {
  it('defaults to 120 per minute', () => {
    expect(publicRateLimit(undefined)).toEqual({ max: 120, windowMs: 60_000 });
    expect(DEFAULT_PUBLIC_RATE_LIMIT.max).toBe(120);
  });

  it('reads PUBLIC_RATE_LIMIT_PER_MINUTE and ignores junk', () => {
    expect(publicRateLimit('5000').max).toBe(5000);
    expect(publicRateLimit('abc').max).toBe(120);
    expect(publicRateLimit('0').max).toBe(120);
    expect(publicRateLimit('-3').max).toBe(120);
    expect(publicRateLimit('1.5').max).toBe(120);
  });
});
