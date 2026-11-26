import { SlidingWindowRateLimiter } from './sliding-window-rate-limiter';

describe('SlidingWindowRateLimiter', () => {
  let now: number;
  const clock = { now: () => new Date(now) };
  const MINUTE = 60_000;
  beforeEach(() => {
    now = Date.parse('2026-11-26T10:00:00Z');
  });

  it('allows `max` per window per key and refuses the next one', () => {
    const limiter = new SlidingWindowRateLimiter(clock, {
      max: 2,
      windowMs: MINUTE,
    });
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(true);
    expect(limiter.tryConsume('a')).toBe(false);
    expect(limiter.tryConsume('b')).toBe(true);
  });

  it('slides: a refusal does not extend the window', () => {
    const limiter = new SlidingWindowRateLimiter(clock, {
      max: 1,
      windowMs: MINUTE,
    });
    expect(limiter.tryConsume('a')).toBe(true);
    now += MINUTE - 1;
    expect(limiter.tryConsume('a')).toBe(false);
    now += 2;
    expect(limiter.tryConsume('a')).toBe(true);
  });

  it('forgets the keys whose attempts all left the window (no unbounded memory)', () => {
    const limiter = new SlidingWindowRateLimiter(clock, {
      max: 1,
      windowMs: MINUTE,
    });
    for (let i = 0; i < 50; i++) limiter.tryConsume(`ip-${i}`);
    expect(limiter.trackedKeys()).toBe(50);
    now += 2 * MINUTE;
    limiter.tryConsume('fresh');
    expect(limiter.trackedKeys()).toBe(1);
  });
});
