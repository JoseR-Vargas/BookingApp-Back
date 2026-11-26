import { SEED_SCHEDULE } from '../../catalog/domain/seed-schedule';
import { WeeklySchedule } from '../../shared/domain/schedule/schedule';
import { AvailabilityLocation, ServiceSelection } from './availability';
import {
  checkDate,
  dayAvailability,
  isClosedDay,
} from './day-availability.rules';

// 2026-10-19 is a Monday, 2026-10-18 a Sunday.
const MONDAY = '2026-10-19';
const SUNDAY = '2026-10-18';

const location = (
  schedule: WeeklySchedule = SEED_SCHEDULE,
): AvailabilityLocation => ({
  id: 'principal',
  name: 'Principal',
  schedule,
});

const selection = (totalDuration = 30): ServiceSelection => ({
  services: [{ id: 'corte', name: 'Corte', duration: totalDuration }],
  professionals: [
    { id: 'ana', name: 'Ana' },
    { id: 'beto', name: 'Beto' },
  ],
  totalDuration,
});

describe('checkDate', () => {
  it('answers the day of week of a real calendar date', () => {
    expect(checkDate(MONDAY)).toEqual({ ok: true, value: 1 });
    expect(checkDate(SUNDAY)).toEqual({ ok: true, value: 0 });
  });

  it.each([
    undefined,
    null,
    42,
    ['2026-10-19'],
    '',
    'abc',
    '2026-13-40',
    '2026-02-30',
  ])('fails with InvalidDate for %p', (value) => {
    const result = checkDate(value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('date must be a valid YYYY-MM-DD date');
      expect(result.error.kind).toBe('validation');
    }
  });
});

describe('isClosedDay', () => {
  it('is true for a closed day and false for an open one', () => {
    expect(isClosedDay(0, SEED_SCHEDULE)).toBe(true);
    expect(isClosedDay(1, SEED_SCHEDULE)).toBe(false);
  });
});

describe('dayAvailability', () => {
  it('lists the free starts of each professional, in the shape the API sends', () => {
    const result = dayAvailability({
      date: MONDAY,
      dayOfWeek: 1,
      location: location(),
      selection: selection(60),
      occupied: [{ professionalId: 'ana', slots: ['10:00', '10:30'] }],
    });

    expect(Object.keys(result)).toEqual([
      'date',
      'closed',
      'location',
      'services',
      'totalDuration',
      'professionals',
    ]);
    expect(result.closed).toBe(false);
    expect(result.location).toEqual({ id: 'principal', name: 'Principal' });
    expect(result.services).toEqual([
      { id: 'corte', name: 'Corte', duration: 60 },
    ]);
    expect(result.totalDuration).toBe(60);
    const [ana, beto] = result.professionals;
    expect(ana.id).toBe('ana');
    expect(ana.slots).not.toContain('09:30');
    expect(ana.slots).not.toContain('10:00');
    expect(ana.slots).not.toContain('10:30');
    expect(ana.slots).toContain('09:00');
    expect(ana.slots).toContain('11:00');
    expect(beto.slots[0]).toBe('09:00');
    expect(beto.slots).toContain('10:00');
  });

  it('occupancy of a professional does not block another one', () => {
    const result = dayAvailability({
      date: MONDAY,
      dayOfWeek: 1,
      location: location(),
      selection: selection(),
      occupied: [{ professionalId: 'ghost', slots: ['09:00'] }],
    });
    expect(result.professionals.map((p) => p.slots[0])).toEqual([
      '09:00',
      '09:00',
    ]);
  });

  it('a closed day has no slots', () => {
    const result = dayAvailability({
      date: SUNDAY,
      dayOfWeek: 0,
      location: location(),
      selection: selection(),
      occupied: [],
    });
    expect(result.closed).toBe(true);
    expect(result.professionals).toEqual([
      { id: 'ana', name: 'Ana', slots: [] },
      { id: 'beto', name: 'Beto', slots: [] },
    ]);
  });

  it('keeps only the starts the schedule offers (starts of the day)', () => {
    const schedule: WeeklySchedule = {
      ...SEED_SCHEDULE,
      weekly: {
        ...SEED_SCHEDULE.weekly,
        1: {
          closed: false,
          open: '09:00',
          close: '20:00',
          starts: ['09:00', '12:00'],
        },
      },
    };
    const result = dayAvailability({
      date: MONDAY,
      dayOfWeek: 1,
      location: location(schedule),
      selection: selection(),
      occupied: [{ professionalId: 'ana', slots: ['12:00'] }],
    });
    expect(result.professionals.map((p) => p.slots)).toEqual([
      ['09:00'],
      ['09:00', '12:00'],
    ]);
  });
});
