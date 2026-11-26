// ===== REGLAS DE LA PRUEBA GRATUITA =====
// A business created by the signup starts with a trial: a deadline and a cap
// of bookings (spec 21). Pure: the clock and the count of bookings come in.

import { Tenant } from './tenant';

/** How long a trial lasts. */
export const TRIAL_DAYS = 14;

/** How many bookings a trial allows. */
export const TRIAL_BOOKING_QUOTA = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The two values the business keeps for its trial. */
export interface Trial {
  trialEndsAt: Date;
  bookingQuota: number;
}

/** The state of a trial at a given moment. */
export interface TrialStatus {
  /** The deadline; null when the trial has no deadline (only a quota). */
  endsAt: Date | null;
  /** Whole days left, rounded up; 0 once the time is over; null without a deadline. */
  daysLeft: number | null;
  bookingsMade: number;
  /** The cap of bookings; null when the trial has no cap. */
  bookingQuota: number | null;
  /** True when the time is over or the quota is reached. */
  blocked: boolean;
}

/** The trial a business created at `now` gets. */
export function newTrial(now: Date): Trial {
  return {
    trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
    bookingQuota: TRIAL_BOOKING_QUOTA,
  };
}

/** Whether the business has a trial at all. */
export function hasTrial(
  tenant: Pick<Tenant, 'trialEndsAt' | 'bookingQuota'>,
): boolean {
  return tenant.trialEndsAt !== null || tenant.bookingQuota !== null;
}

/**
 * The state of the trial of a business, or null when it has none. A business
 * with only a quota (no deadline) never runs out of time, and one with only a
 * deadline has no cap.
 */
export function trialStatusOf(
  tenant: Pick<Tenant, 'trialEndsAt' | 'bookingQuota'>,
  bookingsMade: number,
  now: Date,
): TrialStatus | null {
  if (!hasTrial(tenant)) return null;
  const { trialEndsAt, bookingQuota } = tenant;
  const msLeft = trialEndsAt ? trialEndsAt.getTime() - now.getTime() : null;
  const timeOver = msLeft !== null && msLeft <= 0;
  const quotaReached = bookingQuota !== null && bookingsMade >= bookingQuota;
  return {
    endsAt: trialEndsAt,
    daysLeft: msLeft === null ? null : Math.max(0, Math.ceil(msLeft / DAY_MS)),
    bookingsMade,
    bookingQuota,
    blocked: timeOver || quotaReached,
  };
}
