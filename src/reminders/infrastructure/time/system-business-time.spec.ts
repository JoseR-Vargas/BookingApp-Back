import { Clock } from '../../../shared/application/clock.port';
import { SystemBusinessTime } from './system-business-time';

const ZONE = 'America/Montevideo';
const DST_ZONE = 'America/New_York';

describe('SystemBusinessTime', () => {
  const original = process.env.BUSINESS_TIMEZONE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.BUSINESS_TIMEZONE;
    } else {
      process.env.BUSINESS_TIMEZONE = original;
    }
  });

  const withZone = (zone: string | undefined, instant: Date) => {
    if (zone === undefined) {
      delete process.env.BUSINESS_TIMEZONE;
    } else {
      process.env.BUSINESS_TIMEZONE = zone;
    }
    const clock: Clock = { now: () => instant };
    return new SystemBusinessTime(clock);
  };

  it('reads the date of an instant at the timezone of the business', () => {
    const time = withZone(ZONE, new Date('2026-03-24T14:00:00Z'));

    expect(time.dateOf(new Date('2026-03-24T14:00:00Z'))).toBe('2026-03-24');
    // 23:00 of Montevideo is already the next day.
    expect(time.dateOf(new Date('2026-03-25T02:00:00Z'))).toBe('2026-03-24');
  });

  it('reads the instant of an appointment of the business', () => {
    const time = withZone(ZONE, new Date('2026-03-24T14:00:00Z'));

    expect(time.instantOf('2026-03-25', '10:00')).toEqual(
      new Date('2026-03-25T13:00:00Z'),
    );
  });

  it('follows the daylight saving time of the zone', () => {
    const time = withZone(DST_ZONE, new Date('2026-03-24T14:00:00Z'));

    // In January New York is five hours behind UTC.
    expect(time.instantOf('2026-01-15', '10:00')).toEqual(
      new Date('2026-01-15T15:00:00Z'),
    );
    // In July it is four hours behind UTC.
    expect(time.instantOf('2026-07-01', '10:00')).toEqual(
      new Date('2026-07-01T14:00:00Z'),
    );
  });

  it('falls back to the UTC date when the timezone is unknown', () => {
    const time = withZone(undefined, new Date('2026-03-24T14:00:00Z'));

    expect(time.dateOf(new Date('2026-03-24T23:30:00Z'))).toBe('2026-03-24');
    expect(time.instantOf('2026-03-25', '10:00')).toBeNull();
  });

  it('refuses a date or a time that is not real', () => {
    const time = withZone(ZONE, new Date('2026-03-24T14:00:00Z'));

    expect(time.instantOf('25-03-2026', '10:00')).toBeNull();
    expect(time.instantOf('2026-03-25', '25:00')).toBeNull();
    expect(time.instantOf('2026-03-25', '10:00:00')).toBeNull();
  });

  it('answers the instant the clock says', () => {
    const now = new Date('2026-03-24T14:00:00Z');
    const time = withZone(ZONE, now);

    expect(time.now()).toEqual(now);
  });
});
