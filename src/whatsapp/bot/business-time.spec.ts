import { dropPastTimes, getBusinessNow, nextDates } from './business-time';

describe('getBusinessNow', () => {
  // 2026-10-26T01:30:00Z is still Sunday 22:30 in Buenos Aires (UTC-3).
  const instant = new Date('2026-10-26T01:30:00Z');

  it('returns the wall-clock date and time of the business timezone', () => {
    expect(getBusinessNow('America/Argentina/Buenos_Aires', instant)).toEqual({
      date: '2026-10-25',
      hour: 22,
      minute: 30,
    });
  });

  it('rolls into the next day for timezones ahead of UTC', () => {
    expect(getBusinessNow('Asia/Tokyo', instant)).toEqual({
      date: '2026-10-26',
      hour: 10,
      minute: 30,
    });
  });

  it('uses hour 0 (not 24) at local midnight', () => {
    const midnight = new Date('2026-10-26T03:05:00Z');
    expect(getBusinessNow('America/Argentina/Buenos_Aires', midnight)).toEqual({
      date: '2026-10-26',
      hour: 0,
      minute: 5,
    });
  });

  it.each([undefined, '', '   ', 'Not/AZone', 'nope'])(
    'returns null for an unset or invalid timezone (%p)',
    (timezone) => {
      expect(getBusinessNow(timezone, instant)).toBeNull();
    },
  );
});

describe('nextDates', () => {
  it('returns consecutive calendar days starting at the given date', () => {
    expect(nextDates('2026-10-29', 5)).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('crosses year boundaries and leap days', () => {
    expect(nextDates('2027-12-31', 2)).toEqual(['2027-12-31', '2028-01-01']);
    expect(nextDates('2028-02-28', 3)).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });
});

describe('dropPastTimes', () => {
  const now = { date: '2026-10-26', hour: 10, minute: 30 };
  const times = ['09:00', '10:00', '11:00', '15:00'];

  it('drops every start time at or before the current hour for today', () => {
    expect(dropPastTimes('2026-10-26', times, now)).toEqual(['11:00', '15:00']);
  });

  it('drops the current hour even at the exact top of the hour', () => {
    expect(
      dropPastTimes('2026-10-26', times, { ...now, hour: 11, minute: 0 }),
    ).toEqual(['15:00']);
  });

  it('keeps every time on a future day', () => {
    expect(dropPastTimes('2026-10-27', times, now)).toEqual(times);
  });

  it('drops everything on a past day', () => {
    expect(dropPastTimes('2026-10-25', times, now)).toEqual([]);
  });
});
