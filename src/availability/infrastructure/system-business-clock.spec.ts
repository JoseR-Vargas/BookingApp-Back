import { Clock } from '../../shared/application/clock.port';
import { SystemBusinessClock } from './system-business-clock';

// 2026-10-19T15:00Z is 12:00 on Monday in America/Montevideo (UTC-3).
const at = (iso: string): Clock => ({ now: () => new Date(iso) });

describe('SystemBusinessClock', () => {
  const saved = process.env.BUSINESS_TIMEZONE;

  afterEach(() => {
    if (saved === undefined) delete process.env.BUSINESS_TIMEZONE;
    else process.env.BUSINESS_TIMEZONE = saved;
  });

  it('answers the date and time at the business timezone', () => {
    process.env.BUSINESS_TIMEZONE = 'America/Montevideo';

    expect(new SystemBusinessClock(at('2026-10-19T15:00:00Z')).now()).toEqual({
      today: '2026-10-19',
      time: '12:00',
    });
  });

  it('uses the business date, not the UTC one, near midnight', () => {
    process.env.BUSINESS_TIMEZONE = 'America/Montevideo';

    expect(new SystemBusinessClock(at('2026-10-20T01:05:00Z')).now()).toEqual({
      today: '2026-10-19',
      time: '22:05',
    });
  });

  it.each([undefined, '', '   ', 'Not/AZone'])(
    'without a valid timezone (%p) today is the UTC date and no time is known',
    (zone) => {
      if (zone === undefined) delete process.env.BUSINESS_TIMEZONE;
      else process.env.BUSINESS_TIMEZONE = zone;

      expect(new SystemBusinessClock(at('2026-10-20T01:05:00Z')).now()).toEqual(
        { today: '2026-10-20', time: null },
      );
    },
  );

  it('reads the timezone at every call, not at construction', () => {
    const clock = new SystemBusinessClock(at('2026-10-19T15:00:00Z'));
    delete process.env.BUSINESS_TIMEZONE;
    expect(clock.now().time).toBeNull();

    process.env.BUSINESS_TIMEZONE = 'America/Montevideo';
    expect(clock.now().time).toBe('12:00');
  });
});
