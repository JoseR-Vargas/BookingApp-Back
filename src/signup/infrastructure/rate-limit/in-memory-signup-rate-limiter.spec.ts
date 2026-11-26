import { InMemorySignupRateLimiter } from './in-memory-signup-rate-limiter';

describe('InMemorySignupRateLimiter', () => {
  let now: number;
  const clock = { now: () => new Date(now) };
  const HOUR = 60 * 60 * 1000;
  beforeEach(() => {
    now = Date.parse('2026-11-25T10:00:00Z');
  });

  it('allows 5 attempts per hour by default and refuses the sixth', () => {
    const limiter = new InMemorySignupRateLimiter(clock);
    for (let i = 0; i < 5; i++)
      expect(limiter.tryConsume('1.1.1.1')).toBe(true);
    expect(limiter.tryConsume('1.1.1.1')).toBe(false);
  });

  it('counts every key on its own', () => {
    const limiter = new InMemorySignupRateLimiter(clock, {
      max: 1,
      windowMs: HOUR,
    });
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(false);
    expect(limiter.tryConsume('b')).toBe(true);
  });

  it('allows again once the window has passed, and a refusal does not extend it', () => {
    const limiter = new InMemorySignupRateLimiter(clock, {
      max: 2,
      windowMs: HOUR,
    });
    expect(limiter.tryConsume('a')).toBe(true);
    now += 10 * 60 * 1000;
    expect(limiter.tryConsume('a')).toBe(true);
    now += 10 * 60 * 1000;
    expect(limiter.tryConsume('a')).toBe(false);
    now += 40 * 60 * 1000 + 1; // the first attempt left the window
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(false);
    now += HOUR;
    expect(limiter.tryConsume('a')).toBe(true);
  });
});
