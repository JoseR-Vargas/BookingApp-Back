import {
  TRIAL_BOOKING_QUOTA,
  TRIAL_DAYS,
  hasTrial,
  newTrial,
  trialStatusOf,
} from './trial.rules';

const NOW = new Date('2026-11-25T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

describe('newTrial', () => {
  it('ends 14 days after now and allows 20 bookings', () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(TRIAL_BOOKING_QUOTA).toBe(20);
    expect(newTrial(NOW)).toEqual({
      trialEndsAt: at(14 * DAY),
      bookingQuota: 20,
    });
  });
});

describe('hasTrial', () => {
  it('is false without a deadline and without a quota', () => {
    expect(hasTrial({ trialEndsAt: null, bookingQuota: null })).toBe(false);
  });
  it('is true with either of them', () => {
    expect(hasTrial({ trialEndsAt: NOW, bookingQuota: null })).toBe(true);
    expect(hasTrial({ trialEndsAt: null, bookingQuota: 3 })).toBe(true);
  });
});

describe('trialStatusOf', () => {
  const trial = { trialEndsAt: at(14 * DAY), bookingQuota: 20 };

  it('is null for a business without a trial', () => {
    expect(
      trialStatusOf({ trialEndsAt: null, bookingQuota: null }, 99, NOW),
    ).toBeNull();
  });

  it('is open on the first day', () => {
    expect(trialStatusOf(trial, 0, NOW)).toEqual({
      endsAt: trial.trialEndsAt,
      daysLeft: 14,
      bookingsMade: 0,
      bookingQuota: 20,
      blocked: false,
    });
  });

  it('rounds the days left up', () => {
    expect(trialStatusOf(trial, 0, at(13 * DAY + 1))?.daysLeft).toBe(1);
    expect(trialStatusOf(trial, 0, at(5 * DAY))?.daysLeft).toBe(9);
  });

  it('is open with one booking below the quota and blocked at the quota', () => {
    expect(trialStatusOf(trial, 19, NOW)?.blocked).toBe(false);
    expect(trialStatusOf(trial, 20, NOW)?.blocked).toBe(true);
    expect(trialStatusOf(trial, 25, NOW)?.blocked).toBe(true);
  });

  it('is blocked when the time is over, even with bookings left', () => {
    const over = trialStatusOf(trial, 1, at(14 * DAY));
    expect(over).toMatchObject({ daysLeft: 0, blocked: true });
    expect(trialStatusOf(trial, 1, at(30 * DAY))?.daysLeft).toBe(0);
  });

  it('is still open one millisecond before the deadline', () => {
    expect(trialStatusOf(trial, 1, at(14 * DAY - 1))).toMatchObject({
      daysLeft: 1,
      blocked: false,
    });
  });

  it('a trial with only a deadline has no cap; with only a quota, no deadline', () => {
    expect(
      trialStatusOf({ trialEndsAt: at(DAY), bookingQuota: null }, 500, NOW),
    ).toMatchObject({ bookingQuota: null, blocked: false });
    expect(
      trialStatusOf({ trialEndsAt: null, bookingQuota: 2 }, 2, NOW),
    ).toEqual({
      endsAt: null,
      daysLeft: null,
      bookingsMade: 2,
      bookingQuota: 2,
      blocked: true,
    });
  });
});
