import { SCHEDULE } from '../catalog/catalog.config';
import {
  buildDaySlots,
  dayOfWeekFromIsoDate,
  freeStartTimes,
  occupiedSlots,
  slotsRequired,
  windowSlots,
} from './availability.calculator';

const INTERVAL = SCHEDULE.slotIntervalMinutes;
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

describe('availability.calculator', () => {
  describe('dayOfWeekFromIsoDate', () => {
    it('returns the local day of week without UTC drift', () => {
      expect(dayOfWeekFromIsoDate('2026-10-18')).toBe(0); // Sunday
      expect(dayOfWeekFromIsoDate('2026-10-19')).toBe(1); // Monday
      expect(dayOfWeekFromIsoDate('2026-10-24')).toBe(6); // Saturday
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

  describe('buildDaySlots', () => {
    it('builds half-hour weekday slots from 09:00 to 19:30 without gaps', () => {
      expect(buildDaySlots(1, SCHEDULE)).toEqual(WEEKDAY_SLOTS);
      expect(buildDaySlots(5, SCHEDULE)).toEqual(WEEKDAY_SLOTS);
    });

    it('builds Saturday slots from 09:00 to 17:30 without gaps', () => {
      expect(buildDaySlots(6, SCHEDULE)).toEqual(SATURDAY_SLOTS);
    });

    it('returns no slots on Sunday', () => {
      expect(buildDaySlots(0, SCHEDULE)).toEqual([]);
    });

    it('offers 13:00 as a regular slot', () => {
      expect(buildDaySlots(3, SCHEDULE)).toContain('13:00');
    });
  });

  describe('slotsRequired', () => {
    it.each([
      [20, 1],
      [30, 1],
      [31, 2],
      [50, 2],
      [60, 2],
      [90, 3],
      [120, 4],
      [121, 5],
    ])('a %p-minute service needs %p slot(s)', (duration, expected) => {
      expect(slotsRequired(duration, INTERVAL)).toBe(expected);
    });

    it.each([undefined, null, 0, -30, NaN, '90'])(
      'treats invalid duration %p as one slot',
      (duration) => {
        expect(slotsRequired(duration as number, INTERVAL)).toBe(1);
      },
    );
  });

  describe('occupiedSlots', () => {
    it('unites the slots stored on every booking', () => {
      const result = occupiedSlots([
        { slots: ['10:00', '11:00'] },
        { slots: ['15:00'] },
      ]);
      expect([...result].sort()).toEqual(['10:00', '11:00', '15:00']);
    });

    it('returns an empty set when there are no bookings', () => {
      expect(occupiedSlots([]).size).toBe(0);
    });
  });

  describe('windowSlots', () => {
    it('returns the consecutive slots a window starting at time occupies', () => {
      expect(windowSlots(WEEKDAY_SLOTS, '10:00', 3, INTERVAL)).toEqual([
        '10:00',
        '10:30',
        '11:00',
      ]);
    });

    it('returns the window through midday since the day runs continuously', () => {
      expect(windowSlots(WEEKDAY_SLOTS, '12:30', 2, INTERVAL)).toEqual([
        '12:30',
        '13:00',
      ]);
    });

    it('returns null when the window crosses the closing time', () => {
      expect(windowSlots(WEEKDAY_SLOTS, '19:30', 2, INTERVAL)).toBeNull();
    });

    it('returns null for a start time outside the slot grid', () => {
      expect(windowSlots(WEEKDAY_SLOTS, '10:15', 1, INTERVAL)).toBeNull();
    });

    it('returns null on a closed day', () => {
      expect(windowSlots([], '10:00', 1, INTERVAL)).toBeNull();
    });
  });

  describe('freeStartTimes', () => {
    const none = new Set<string>();

    it('offers every slot for services needing one slot', () => {
      expect(freeStartTimes(WEEKDAY_SLOTS, none, 1, INTERVAL)).toEqual(
        WEEKDAY_SLOTS,
      );
    });

    it('excludes occupied slots', () => {
      const occupied = new Set(['10:00', '15:00']);
      const result = freeStartTimes(WEEKDAY_SLOTS, occupied, 1, INTERVAL);
      expect(result).not.toContain('10:00');
      expect(result).not.toContain('15:00');
      expect(result).toContain('11:00');
    });

    it('offers a 90-minute service at 10:00 when 10:00, 10:30 and 11:00 are free', () => {
      expect(freeStartTimes(WEEKDAY_SLOTS, none, 3, INTERVAL)).toContain(
        '10:00',
      );
    });

    it('does not offer a 90-minute service when one of its blocks is occupied', () => {
      const result = freeStartTimes(
        WEEKDAY_SLOTS,
        new Set(['11:00']),
        3,
        INTERVAL,
      );
      expect(result).not.toContain('10:00');
      expect(result).not.toContain('10:30');
      expect(result).not.toContain('11:00');
      expect(result).toContain('09:30');
      expect(result).toContain('11:30');
    });

    it('offers a 90-minute service at midday but not past the last fitting start', () => {
      const result = freeStartTimes(WEEKDAY_SLOTS, none, 3, INTERVAL);
      expect(result).toContain('12:00');
      expect(result).toContain('18:30');
      expect(result).not.toContain('19:00');
      expect(result).not.toContain('19:30');
      expect(result).toEqual(WEEKDAY_SLOTS.slice(0, -2));
    });

    it('does not offer a 90-minute service past Saturday last fitting start', () => {
      const result = freeStartTimes(SATURDAY_SLOTS, none, 3, INTERVAL);
      expect(result).not.toContain('17:00');
      expect(result).toContain('16:30');
    });

    it('returns nothing on a closed day', () => {
      expect(freeStartTimes([], none, 1, INTERVAL)).toEqual([]);
    });
  });

  describe('30-minute grid rule', () => {
    const weekday = buildDaySlots(1, SCHEDULE);
    const saturday = buildDaySlots(6, SCHEDULE);

    /** Start times a service of `duration` minutes can still take. */
    const freeAfter = (
      booked: { start: string; duration: number }[],
      duration: number,
      daySlots = weekday,
    ) => {
      const occupied = occupiedSlots(
        booked.map(({ start, duration: minutes }) => ({
          slots: windowSlots(
            daySlots,
            start,
            slotsRequired(minutes, INTERVAL),
            INTERVAL,
          ) as string[],
        })),
      );
      return freeStartTimes(
        daySlots,
        occupied,
        slotsRequired(duration, INTERVAL),
        INTERVAL,
      );
    };

    it('uses a 30-minute interval', () => {
      expect(INTERVAL).toBe(30);
    });

    it('offers :00 and :30 starts only, from opening to the last half hour', () => {
      expect(weekday).toHaveLength(22);
      expect(weekday[0]).toBe('09:00');
      expect(weekday[1]).toBe('09:30');
      expect(weekday[weekday.length - 1]).toBe('19:30');
      expect(saturday).toHaveLength(18);
      expect(saturday[saturday.length - 1]).toBe('17:30');
      expect(
        [...weekday, ...saturday].every((slot) => /:(00|30)$/.test(slot)),
      ).toBe(true);
    });

    it('a 20-minute booking at 09:00 takes one block and leaves 09:30 free', () => {
      const free = freeAfter([{ start: '09:00', duration: 20 }], 20);
      expect(free).not.toContain('09:00');
      expect(free).toContain('09:30');
    });

    it('a 50-minute booking at 09:00 takes two blocks and leaves 10:00 free', () => {
      const free = freeAfter([{ start: '09:00', duration: 50 }], 30);
      expect(free).not.toContain('09:00');
      expect(free).not.toContain('09:30');
      expect(free).toContain('10:00');
    });

    it('a 90-minute booking at 09:00 blocks 09:30 and 10:00 and leaves 10:30 free', () => {
      expect(
        windowSlots(weekday, '09:00', slotsRequired(90, INTERVAL), INTERVAL),
      ).toEqual(['09:00', '09:30', '10:00']);
      const free = freeAfter([{ start: '09:00', duration: 90 }], 30);
      expect(free).not.toContain('09:30');
      expect(free).not.toContain('10:00');
      expect(free).toContain('10:30');
    });

    it('a booking ending exactly at :30 frees that time with no gap', () => {
      // 60 min from 09:30 ends at 10:30.
      const free = freeAfter([{ start: '09:30', duration: 60 }], 30);
      expect(free).toContain('09:00');
      expect(free).not.toContain('10:00');
      expect(free).toContain('10:30');
    });

    it.each([
      [30, '19:30', '17:30'],
      [60, '19:00', '17:00'],
      [90, '18:30', '16:30'],
    ])(
      'the last valid start of a %p-minute service is %p on weekdays and %p on Saturday',
      (duration, weekdayLast, saturdayLast) => {
        expect(freeAfter([], duration).pop()).toBe(weekdayLast);
        expect(freeAfter([], duration, saturday).pop()).toBe(saturdayLast);
      },
    );

    it('rejects a start that would run past closing', () => {
      const required = slotsRequired(90, INTERVAL);
      expect(windowSlots(weekday, '19:00', required, INTERVAL)).toBeNull();
      expect(windowSlots(saturday, '17:00', required, INTERVAL)).toBeNull();
    });

    it('rejects an off-grid start such as 09:15', () => {
      expect(windowSlots(weekday, '09:15', 1, INTERVAL)).toBeNull();
      expect(freeAfter([], 20)).not.toContain('09:15');
    });
  });
});
