import { createHash, randomBytes } from 'crypto';
import { getBusinessNow } from '../shared/domain/business-time';

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

/** Secret the client holds to cancel one booking. Only its hash is stored. */
export function generateCancelToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex digest stored in `Booking.cancelTokenHash`. */
export function hashCancelToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function secondsOfDay(hours: number, minutes: number, seconds = 0): number {
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Whether a booking starting at `date` + `time` (wall clock in the business
 * timezone) can still be cancelled by the client: `now <= start - 60 s`.
 *
 * `getBusinessNow` has minute resolution, so the seconds come from the
 * instant itself. Every zone offset is a whole number of minutes, which makes
 * the UTC seconds equal to the local seconds.
 */
export function cancelWindow(
  date: string,
  time: string,
  timezone: string | undefined,
  instant: Date = new Date(),
): CancelWindow {
  const now = getBusinessNow(timezone, instant);
  if (!now) {
    return 'unknown';
  }

  const match = TIME.exec(time ?? '');
  const hours = match ? Number(match[1]) : NaN;
  const minutes = match ? Number(match[2]) : NaN;
  if (!match || hours > 23 || minutes > 59) {
    return 'closed';
  }

  if (now.date !== date) {
    return now.date < date ? 'open' : 'closed';
  }

  const nowSeconds = secondsOfDay(
    now.hour,
    now.minute,
    instant.getUTCSeconds(),
  );
  const startSeconds = secondsOfDay(hours, minutes);
  return nowSeconds <= startSeconds - CANCEL_CUTOFF_SECONDS ? 'open' : 'closed';
}
