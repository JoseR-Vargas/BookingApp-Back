import { WeeklySchedule } from './schedule';
import {
  buildDaySlots,
  dayOfWeekFromIsoDate,
  offeredStarts,
  slotsRequired,
  toMinutes,
} from './schedule.rules';

const WEEKDAY = { closed: false, open: '09:00', close: '20:00' } as const;

/** The seed schedule, written out: the shared rules know no catalog. */
const SEED: WeeklySchedule = {
  weekly: {
    0: { closed: true },
    1: WEEKDAY,
    2: WEEKDAY,
    3: WEEKDAY,
    4: WEEKDAY,
    5: WEEKDAY,
    6: { closed: false, open: '09:00', close: '18:00' },
  },
  slotIntervalMinutes: 30,
  startIntervalMinutes: 30,
};

const halfHours = (fromHour: number, toHour: number): string[] => {
  const slots: string[] = [];
  for (let hour = fromHour; hour < toHour; hour++) {
    const label = String(hour).padStart(2, '0');
    slots.push(`${label}:00`, `${label}:30`);
  }
  return slots;
};
const WEEKDAY_SLOTS = halfHours(9, 20);
const SATURDAY_SLOTS = halfHours(9, 18);

describe('shared schedule rules', () => {
  describe('dayOfWeekFromIsoDate', () => {
    it('returns the local day of week without UTC drift', () => {
      expect(dayOfWeekFromIsoDate('2026-10-18')).toBe(0);
      expect(dayOfWeekFromIsoDate('2026-10-19')).toBe(1);
      expect(dayOfWeekFromIsoDate('2026-10-24')).toBe(6);
    });

    it.each([
      '',
      'abc',
      '2026-13-40',
      '2026-02-30',
      '2026-1-05',
      '2026-01-05T00:00',
    ])('returns null for invalid date %p', (value) => {
      expect(dayOfWeekFromIsoDate(value)).toBeNull();
    });

    it('accepts leap days on leap years only', () => {
      expect(dayOfWeekFromIsoDate('2028-02-29')).not.toBeNull();
      expect(dayOfWeekFromIsoDate('2026-02-29')).toBeNull();
    });
  });

  describe('toMinutes', () => {
    it.each([
      ['00:00', 0],
      ['9:30', 570],
      ['09:30', 570],
      ['23:59', 1439],
    ])('%s is %d minutes since midnight', (time, minutes) => {
      expect(toMinutes(time)).toBe(minutes);
    });

    it.each(['', 'abc', '24:00', '10:60', '10', '10:5'])(
      'is null for the invalid time %p',
      (time) => {
        expect(toMinutes(time)).toBeNull();
      },
    );
  });

  describe('buildDaySlots', () => {
    it('builds half-hour slots from opening to closing without gaps', () => {
      expect(buildDaySlots(1, SEED)).toEqual(WEEKDAY_SLOTS);
      expect(buildDaySlots(6, SEED)).toEqual(SATURDAY_SLOTS);
    });

    it('returns no slots on a closed day', () => {
      expect(buildDaySlots(0, SEED)).toEqual([]);
    });

    it('supports half-hour opening and closing times', () => {
      const schedule: WeeklySchedule = {
        ...SEED,
        weekly: {
          ...SEED.weekly,
          2: { closed: false, open: '09:30', close: '12:00' },
        },
      };
      expect(buildDaySlots(2, schedule)).toEqual([
        '09:30',
        '10:00',
        '10:30',
        '11:00',
        '11:30',
      ]);
    });

    it('returns no slots for invalid hours', () => {
      const schedule: WeeklySchedule = {
        ...SEED,
        weekly: {
          ...SEED.weekly,
          2: { closed: false, open: 'abc', close: '12:00' },
        },
      };
      expect(buildDaySlots(2, schedule)).toEqual([]);
    });
  });

  describe('slotsRequired', () => {
    it.each([
      [20, 1],
      [30, 1],
      [31, 2],
      [60, 2],
      [90, 3],
      [121, 5],
    ])('a %p-minute service needs %p slot(s)', (duration, expected) => {
      expect(slotsRequired(duration, 30)).toBe(expected);
    });

    it.each([undefined, null, 0, -30, NaN, '90'])(
      'treats invalid duration %p as one slot',
      (duration) => {
        expect(slotsRequired(duration as number, 30)).toBe(1);
      },
    );
  });

  describe('offeredStarts', () => {
    const withInterval = (
      startIntervalMinutes: number,
      weekly: WeeklySchedule['weekly'] = SEED.weekly,
    ): WeeklySchedule => ({ ...SEED, weekly, startIntervalMinutes });

    it('with the default interval of 30 equals the 30-minute grid', () => {
      expect(offeredStarts(1, withInterval(30))).toEqual(WEEKDAY_SLOTS);
      expect(offeredStarts(6, withInterval(30))).toEqual(SATURDAY_SLOTS);
    });

    it('offers every 180 minutes from opening', () => {
      expect(offeredStarts(1, withInterval(180))).toEqual([
        '09:00',
        '12:00',
        '15:00',
        '18:00',
      ]);
    });

    it('counts from an opening that is not on the hour', () => {
      const weekly = {
        ...SEED.weekly,
        1: { closed: false as const, open: '09:30', close: '13:00' },
      };
      expect(offeredStarts(1, withInterval(60, weekly))).toEqual([
        '09:30',
        '10:30',
        '11:30',
        '12:30',
      ]);
    });

    it('offers the listed starts of a day, which win over the interval', () => {
      const weekly = {
        ...SEED.weekly,
        1: {
          closed: false as const,
          open: '09:00',
          close: '20:00',
          starts: ['09:00', '10:30', '15:00'],
        },
      };
      const schedule = withInterval(180, weekly);
      expect(offeredStarts(1, schedule)).toEqual(['09:00', '10:30', '15:00']);
      expect(offeredStarts(6, schedule)).toEqual(['09:00', '12:00', '15:00']);
    });

    it('returns nothing for a closed day or invalid hours', () => {
      expect(offeredStarts(0, withInterval(60))).toEqual([]);
      const weekly = {
        ...SEED.weekly,
        1: { closed: false as const, open: 'abc', close: '13:00' },
      };
      expect(offeredStarts(1, withInterval(60, weekly))).toEqual([]);
    });
  });
});
