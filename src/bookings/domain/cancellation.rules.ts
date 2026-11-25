import { Result, err, ok } from '../../shared/domain/result';
import { Booking } from './booking';
import {
  BookingNotFound,
  BusinessHoursUnverifiable,
  CancellationClosed,
} from './booking.errors';

/** A cancel token is 32 random bytes in base64url: 43 characters. */
export const CANCEL_TOKEN_LENGTH = 43;

/** Shape of a token; anything else cannot match a booking. */
export const CANCEL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A booking can be cancelled up to this long before it starts. */
const CANCEL_CUTOFF_SECONDS = 60;

const TIME = /^(\d{1,2}):(\d{2})$/;

/**
 * 'open': the client may still cancel. 'closed': the cutoff has passed (or the
 * booking time is unreadable). 'unknown': the business timezone is missing or
 * invalid, so the cutoff cannot be judged and nothing may be cancelled blind.
 */
export type CancelWindow = 'open' | 'closed' | 'unknown';

export type CancelState = 'cancellable' | 'closed' | 'cancelled';

/**
 * "Now" at the business: its date, the wall-clock time ('HH:MM', null when
 * the timezone is missing or invalid) and the seconds into the minute. The
 * timezone is data the clock already applied; the rules never read it.
 */
export interface BusinessInstant {
  today: string;
  time: string | null;
  seconds?: number;
}

const secondsOfDay = (hours: number, minutes: number, seconds = 0): number =>
  hours * 3600 + minutes * 60 + seconds;

/** Whether `token` has the shape of a cancel token. */
export const isCancelTokenShape = (token: string | null | undefined): boolean =>
  CANCEL_TOKEN_PATTERN.test(token ?? '');

/**
 * Whether a booking starting at `date` + `time` (wall clock in the business
 * timezone) can still be cancelled by the client: `now <= start - 60 s`.
 */
export function cancelWindow(
  date: string,
  time: string,
  now: BusinessInstant,
): CancelWindow {
  if (now.time === null) {
    return 'unknown';
  }

  const match = TIME.exec(time ?? '');
  const hours = match ? Number(match[1]) : NaN;
  const minutes = match ? Number(match[2]) : NaN;
  if (!match || hours > 23 || minutes > 59) {
    return 'closed';
  }

  if (now.today !== date) {
    return now.today < date ? 'open' : 'closed';
  }

  const [nowHour, nowMinute] = now.time.split(':').map(Number);
  const nowSeconds = secondsOfDay(nowHour, nowMinute, now.seconds ?? 0);
  const startSeconds = secondsOfDay(hours, minutes);
  return nowSeconds <= startSeconds - CANCEL_CUTOFF_SECONDS ? 'open' : 'closed';
}

/** A cancelled booking needs no clock; anything else is judged at the business. */
export function cancelStateOf(
  booking: Pick<Booking, 'status' | 'date' | 'time'>,
  now: BusinessInstant,
): Result<CancelState, BusinessHoursUnverifiable> {
  if (booking.status === 'cancelled') {
    return ok('cancelled');
  }
  const window = cancelWindow(booking.date, booking.time, now);
  if (window === 'unknown') {
    return err(new BusinessHoursUnverifiable());
  }
  return ok(window === 'open' ? 'cancellable' : 'closed');
}

/** Only an open window lets a cancellation through. */
export function ensureCancellable(
  state: CancelState,
): Result<void, CancellationClosed> {
  return state === 'closed' ? err(new CancellationClosed()) : ok(undefined);
}

/** The booking that owns a token, or the one answer for every unknown token. */
export function foundByToken(
  booking: Booking | null,
): Result<Booking, BookingNotFound> {
  return booking ? ok(booking) : err(new BookingNotFound());
}

/**
 * What the public cancel page may see. Deliberately no client name, phone or
 * email and no ids: the token alone grants access to this.
 */
export interface CancellationSummary {
  state: CancelState;
  services: { name: string }[];
  professional: { name: string };
  date: string;
  time: string;
}

export const toCancellationSummary = (
  booking: Booking,
  state: CancelState,
): CancellationSummary => ({
  state,
  services: (booking.services ?? []).map(({ name }) => ({ name })),
  professional: { name: booking.professional?.name },
  date: booking.date,
  time: booking.time,
});
