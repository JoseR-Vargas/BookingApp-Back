import { WeeklySchedule } from '../catalog/catalog.config';
import {
  ScheduleImpactService,
  currentBusinessDate,
  isOutsideSchedule,
} from './schedule-impact';

const schedule: WeeklySchedule = {
  weekly: {
    0: { closed: true },
    1: { closed: false, open: '09:30', close: '19:00' },
    2: { closed: false, open: '09:00', close: '20:00' },
    3: { closed: false, open: '09:00', close: '20:00' },
    4: { closed: false, open: '09:00', close: '20:00' },
    5: { closed: false, open: '09:00', close: '20:00' },
    6: { closed: true },
  },
  slotIntervalMinutes: 30,
  startIntervalMinutes: 30,
};

// 2026-10-19 is a Monday, 2026-10-18 a Sunday, 2026-10-24 a Saturday.
describe('isOutsideSchedule', () => {
  it('is false when every slot is inside [open, close)', () => {
    expect(
      isOutsideSchedule(
        { date: '2026-10-19', time: '09:30', slots: ['09:30', '10:00'] },
        schedule,
      ),
    ).toBe(false);
    expect(
      isOutsideSchedule(
        { date: '2026-10-19', time: '18:00', slots: ['18:00', '18:30'] },
        schedule,
      ),
    ).toBe(false);
  });

  it('is true when the day is closed', () => {
    expect(
      isOutsideSchedule(
        { date: '2026-10-18', time: '10:00', slots: ['10:00'] },
        schedule,
      ),
    ).toBe(true);
    expect(
      isOutsideSchedule(
        { date: '2026-10-24', time: '10:00', slots: ['10:00'] },
        schedule,
      ),
    ).toBe(true);
  });

  it('is true when a slot starts before opening', () => {
    expect(
      isOutsideSchedule(
        { date: '2026-10-19', time: '09:00', slots: ['09:00'] },
        schedule,
      ),
    ).toBe(true);
  });

  it('is true when a slot starts at or after closing (close is exclusive)', () => {
    expect(
      isOutsideSchedule(
        { date: '2026-10-19', time: '19:00', slots: ['19:00'] },
        schedule,
      ),
    ).toBe(true);
  });

  it('is true when only the tail of a multi-slot booking leaves the window', () => {
    expect(
      isOutsideSchedule(
        {
          date: '2026-10-19',
          time: '18:30',
          slots: ['18:30', '19:00', '19:30'],
        },
        schedule,
      ),
    ).toBe(true);
  });

  it('does not count a booking that is off the offered starts', () => {
    // 10:00 is not an offered start with 180 minutes from the 09:30 opening.
    const sparse = { ...schedule, startIntervalMinutes: 180 };
    expect(
      isOutsideSchedule(
        { date: '2026-10-19', time: '10:00', slots: ['10:00', '10:30'] },
        sparse,
      ),
    ).toBe(false);
  });

  it('falls back to the start time for bookings without slots', () => {
    expect(
      isOutsideSchedule({ date: '2026-10-19', time: '19:30' }, schedule),
    ).toBe(true);
    expect(
      isOutsideSchedule(
        { date: '2026-10-19', time: '10:00', slots: [] },
        schedule,
      ),
    ).toBe(false);
  });

  it('ignores bookings whose date is not a valid calendar date', () => {
    expect(
      isOutsideSchedule(
        { date: 'garbage', time: '10:00', slots: ['10:00'] },
        schedule,
      ),
    ).toBe(false);
  });
});

describe('currentBusinessDate', () => {
  const instant = new Date('2026-11-15T02:00:00Z');

  it('uses the business timezone when configured', () => {
    expect(currentBusinessDate(instant, 'America/Mexico_City')).toBe(
      '2026-11-14',
    );
    expect(currentBusinessDate(instant, 'Asia/Tokyo')).toBe('2026-11-15');
  });

  it('falls back to the UTC date when the timezone is unset or invalid', () => {
    expect(currentBusinessDate(instant, undefined)).toBe('2026-11-15');
    expect(currentBusinessDate(instant, '')).toBe('2026-11-15');
    expect(currentBusinessDate(instant, 'Not/AZone')).toBe('2026-11-15');
  });
});

describe('ScheduleImpactService', () => {
  let found: unknown[];
  const exec = jest.fn(() => Promise.resolve(found));
  const lean = jest.fn(() => ({ exec }));
  const bookingModel = { find: jest.fn(() => ({ lean })) };
  const service = new ScheduleImpactService(bookingModel as never);

  beforeEach(() => {
    jest.clearAllMocks();
    found = [];
  });

  it('only loads non-cancelled bookings from today onwards', async () => {
    await service.countAffected(schedule, '2026-10-19');

    expect(bookingModel.find).toHaveBeenCalledWith(
      { date: { $gte: '2026-10-19' }, status: { $ne: 'cancelled' } },
      { date: 1, time: 1, slots: 1 },
    );
  });

  it('counts only the bookings that no longer fit', async () => {
    found = [
      { date: '2026-10-19', time: '10:00', slots: ['10:00', '10:30'] }, // fits
      { date: '2026-10-19', time: '09:00', slots: ['09:00'] }, // before opening
      { date: '2026-10-18', time: '10:00', slots: ['10:00'] }, // Sunday closed
      { date: '2026-10-20', time: '19:30', slots: ['19:30'] }, // fits Tuesday
      { date: '2026-10-24', time: '10:00', slots: ['10:00'] }, // Saturday closed
    ];

    await expect(service.countAffected(schedule, '2026-10-01')).resolves.toBe(
      3,
    );
  });

  it('returns 0 when there are no future bookings', async () => {
    await expect(service.countAffected(schedule, '2026-10-01')).resolves.toBe(
      0,
    );
  });

  describe('scoped to a location', () => {
    const scope = { locationId: 'centro', defaultLocationId: 'principal' };
    // 2026-10-18 is a Sunday: closed in `schedule`, so every booking is outside it.
    const sunday = (location?: { id: string }) => ({
      date: '2026-10-18',
      time: '10:00',
      slots: ['10:00'],
      ...(location ? { location } : {}),
    });

    it('counts only the bookings of that location', async () => {
      found = [
        sunday({ id: 'centro' }),
        sunday({ id: 'centro' }),
        sunday({ id: 'principal' }),
        sunday(),
      ];

      await expect(
        service.countAffected(schedule, '2026-10-01', scope),
      ).resolves.toBe(2);
    });

    it('counts bookings without location only for the default location', async () => {
      found = [sunday({ id: 'centro' }), sunday(), sunday()];

      await expect(
        service.countAffected(schedule, '2026-10-01', {
          locationId: 'principal',
          defaultLocationId: 'principal',
        }),
      ).resolves.toBe(2);
      await expect(
        service.countAffected(schedule, '2026-10-01', scope),
      ).resolves.toBe(1);
    });

    it('still ignores cancelled/past bookings through the same query and loads the location id', async () => {
      await service.countAffected(schedule, '2026-10-19', scope);

      expect(bookingModel.find).toHaveBeenCalledWith(
        { date: { $gte: '2026-10-19' }, status: { $ne: 'cancelled' } },
        { date: 1, time: 1, slots: 1, 'location.id': 1 },
      );
    });
  });
});
