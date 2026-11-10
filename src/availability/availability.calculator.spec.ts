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
const WEEKDAY_SLOTS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
];
const SATURDAY_SLOTS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
];

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
    it('builds hourly weekday slots from 09:00 to 19:00 without gaps', () => {
      expect(buildDaySlots(1, SCHEDULE)).toEqual(WEEKDAY_SLOTS);
      expect(buildDaySlots(5, SCHEDULE)).toEqual(WEEKDAY_SLOTS);
    });

    it('builds Saturday slots from 09:00 to 17:00 without gaps', () => {
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
      [60, 1],
      [90, 2],
      [120, 2],
      [121, 3],
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
        '11:00',
        '12:00',
      ]);
    });

    it('returns the window through midday since the day runs continuously', () => {
      expect(windowSlots(WEEKDAY_SLOTS, '12:00', 2, INTERVAL)).toEqual([
        '12:00',
        '13:00',
      ]);
    });

    it('returns null when the window crosses the closing time', () => {
      expect(windowSlots(WEEKDAY_SLOTS, '19:00', 2, INTERVAL)).toBeNull();
    });

    it('returns null for a start time outside the slot grid', () => {
      expect(windowSlots(WEEKDAY_SLOTS, '10:30', 1, INTERVAL)).toBeNull();
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

    it('offers a 90-minute service at 10:00 when 10:00 and 11:00 are free', () => {
      expect(freeStartTimes(WEEKDAY_SLOTS, none, 2, INTERVAL)).toContain(
        '10:00',
      );
    });

    it('does not offer a 90-minute service when its second slot is occupied', () => {
      const result = freeStartTimes(
        WEEKDAY_SLOTS,
        new Set(['11:00']),
        2,
        INTERVAL,
      );
      expect(result).not.toContain('10:00');
      expect(result).not.toContain('11:00');
      expect(result).toContain('09:00');
    });

    it('offers a 90-minute service at midday but not at weekday close', () => {
      const result = freeStartTimes(WEEKDAY_SLOTS, none, 2, INTERVAL);
      expect(result).toContain('12:00');
      expect(result).not.toContain('19:00');
      expect(result).toEqual([
        '09:00',
        '10:00',
        '11:00',
        '12:00',
        '13:00',
        '14:00',
        '15:00',
        '16:00',
        '17:00',
        '18:00',
      ]);
    });

    it('does not offer a 90-minute service at Saturday close', () => {
      const result = freeStartTimes(SATURDAY_SLOTS, none, 2, INTERVAL);
      expect(result).not.toContain('17:00');
      expect(result).toContain('16:00');
    });

    it('returns nothing on a closed day', () => {
      expect(freeStartTimes([], none, 1, INTERVAL)).toEqual([]);
    });
  });
});
