// ===== ADAPTADOR: EL TIEMPO DEL NEGOCIO =====
// The clock of the business seen from `BUSINESS_TIMEZONE` (spec 18, spec 24).
// The same `Intl` the availability clock uses, and the reverse of it: the
// instant of a wall clock of the business.

import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import { BusinessTime } from '../../application/ports/business-time.port';

const pad = (value: number): string => String(value).padStart(2, '0');

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * The wall clock of an instant in an IANA timezone, or null when the zone is
 * unknown (Intl throws a RangeError for an unknown zone).
 */
function wallClock(timezone: string, instant: Date): WallClock | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(instant);
    const part = (type: string): string =>
      parts.find((candidate) => candidate.type === type)?.value ?? '';
    return {
      year: Number(part('year')),
      month: Number(part('month')),
      day: Number(part('day')),
      hour: Number(part('hour')),
      minute: Number(part('minute')),
      second: Number(part('second')),
    };
  } catch {
    return null;
  }
}

@Injectable()
export class SystemBusinessTime implements BusinessTime {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  now(): Date {
    return this.clock.now();
  }

  dateOf(instant: Date): string {
    const zone = this.zone();
    if (!zone) {
      return instant.toISOString().slice(0, 10);
    }
    const wall = wallClock(zone, instant);
    if (!wall) {
      return instant.toISOString().slice(0, 10);
    }
    return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
  }

  /**
   * The instant of a wall clock of the business. The offset of the zone is
   * applied twice, so the daylight saving time is right on both sides of the
   * moment it changes.
   */
  instantOf(date: string, time: string): Date | null {
    const zone = this.zone();
    if (!zone) {
      return null;
    }
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
    if (!dateMatch || !timeMatch) {
      return null;
    }
    const [year, month, day] = dateMatch.slice(1).map(Number);
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour > 23 ||
      minute > 59
    ) {
      return null;
    }
    const asUtc = Date.UTC(year, month - 1, day, hour, minute);
    const first = asUtc - this.offsetMs(zone, new Date(asUtc));
    const settled = asUtc - this.offsetMs(zone, new Date(first));
    return new Date(settled);
  }

  /** How many milliseconds the zone is ahead of UTC at that instant. */
  private offsetMs(zone: string, instant: Date): number {
    const wall = wallClock(zone, instant);
    if (!wall) {
      return 0;
    }
    const asUtc = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
    );
    return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
  }

  /** The timezone of the business, or null when it is not set. */
  private zone(): string | null {
    const zone = process.env.BUSINESS_TIMEZONE?.trim();
    return zone ? zone : null;
  }
}
