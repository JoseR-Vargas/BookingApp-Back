import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../shared/application/clock.port';
import {
  BusinessClock,
  BusinessMoment,
} from '../application/ports/business-clock.port';

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Wall-clock date and time of an instant in an IANA timezone, or null when the
 * timezone is unset or unknown (Intl throws a RangeError for an unknown zone).
 */
function wallClock(
  timezone: string | undefined,
  instant: Date,
): { date: string; hour: number; minute: number } | null {
  const zone = timezone?.trim();
  if (!zone) {
    return null;
  }
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(instant);
    const part = (type: string) =>
      parts.find((candidate) => candidate.type === type)?.value ?? '';
    return {
      date: `${part('year')}-${part('month')}-${part('day')}`,
      hour: Number(part('hour')),
      minute: Number(part('minute')),
    };
  } catch {
    return null;
  }
}

/**
 * The business's clock: the system instant seen from `BUSINESS_TIMEZONE`. The
 * timezone-less fallback is the UTC date and no time, so no hour is ever
 * hidden (a wrong zone would hide real turns). Read on every call.
 */
@Injectable()
export class SystemBusinessClock implements BusinessClock {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  now(): BusinessMoment {
    const instant = this.clock.now();
    const zoned = wallClock(process.env.BUSINESS_TIMEZONE, instant);
    return {
      today: zoned?.date ?? instant.toISOString().slice(0, 10),
      time: zoned ? `${pad(zoned.hour)}:${pad(zoned.minute)}` : null,
    };
  }
}
