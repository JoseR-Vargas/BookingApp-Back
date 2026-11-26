import {
  LocationSummary,
  OfferedService,
  PublishedService,
} from './availability';
import {
  addDays,
  pickLocation,
  pickService,
  publicDates,
  publicDay,
  publishedServices,
} from './public-view.rules';

const services: OfferedService[] = [
  { id: 'a', name: 'A', duration: 30 },
  { id: 'b', name: 'B', duration: 60 },
];

describe('addDays / publicDates', () => {
  it('moves a calendar date across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-19', 0)).toBe('2026-10-19');
  });

  it('lists `count` consecutive dates from today', () => {
    expect(publicDates('2026-10-30', 3)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(publicDates('2026-10-30', 0)).toEqual([]);
  });
});

describe('publishedServices', () => {
  it('publishes every service when serviceIds is null', () => {
    expect(publishedServices(services, null)).toEqual(services);
  });

  it('publishes only the chosen ones, keeping the catalog order', () => {
    expect(publishedServices(services, ['b'])).toEqual([services[1]]);
    expect(publishedServices(services, [])).toEqual([]);
  });

  it('answers id, name and duration only', () => {
    const extra = [{ id: 'a', name: 'A', duration: 30, price: 9 }];
    expect(publishedServices(extra, null)).toEqual([services[0]]);
  });
});

describe('pickService', () => {
  const published: PublishedService[] = services;

  it('takes the requested one, or the first when none is requested', () => {
    expect(pickService(published, 'b')).toEqual({ ok: true, value: 'b' });
    expect(pickService(published, undefined)).toEqual({ ok: true, value: 'a' });
  });

  it('is null when nothing is published and nothing was requested', () => {
    expect(pickService([], undefined)).toEqual({ ok: true, value: null });
  });

  it('fails with a not-found error for an unpublished service', () => {
    const result = pickService(published, 'nope');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('not-found');
      expect(result.error.message).toBe('Service "nope" not found');
    }
    expect(pickService([], 'nope').ok).toBe(false);
  });
});

describe('pickLocation', () => {
  const locations: LocationSummary[] = [
    { id: 'principal', name: 'Principal' },
    { id: 'centro', name: 'Centro' },
  ];

  it('takes the first (default) location when none is requested', () => {
    expect(pickLocation(locations, undefined)).toEqual({
      ok: true,
      value: locations[0],
    });
  });

  it('takes the requested active one', () => {
    expect(pickLocation(locations, 'centro')).toEqual({
      ok: true,
      value: locations[1],
    });
  });

  it('fails for an unknown one, naming it', () => {
    const result = pickLocation(locations, 'nope');
    expect(!result.ok && result.error.message).toBe(
      'Location "nope" not found',
    );
    expect(!result.ok && result.error.kind).toBe('not-found');
  });

  it('fails with an empty id when there is no location at all', () => {
    const result = pickLocation([], undefined);
    expect(!result.ok && result.error.message).toBe('Location "" not found');
  });
});

describe('publicDay', () => {
  const day = {
    date: '2026-10-19',
    closed: false,
    professionals: [
      { id: 'ana', name: 'Ana', slots: ['09:00', '12:00', '12:30'] },
      { id: 'beto', name: 'Beto', slots: ['09:00', '10:00'] },
    ],
  };

  it('merges the professionals free at each time, sorted by time', () => {
    expect(publicDay(day, '2026-10-18', null)).toEqual({
      date: '2026-10-19',
      closed: false,
      times: [
        {
          time: '09:00',
          professionals: [
            { id: 'ana', name: 'Ana' },
            { id: 'beto', name: 'Beto' },
          ],
        },
        { time: '10:00', professionals: [{ id: 'beto', name: 'Beto' }] },
        { time: '12:00', professionals: [{ id: 'ana', name: 'Ana' }] },
        { time: '12:30', professionals: [{ id: 'ana', name: 'Ana' }] },
      ],
    });
  });

  it('drops the times of today that are not after the current time', () => {
    const today = publicDay(day, '2026-10-19', '12:00');
    expect(today.times.map((t) => t.time)).toEqual(['12:30']);
  });

  it('does not filter other days, nor today without a business time', () => {
    expect(publicDay(day, '2026-10-18', '23:00').times).toHaveLength(4);
    expect(publicDay(day, '2026-10-19', null).times).toHaveLength(4);
  });

  it('keeps a closed day with no times', () => {
    expect(
      publicDay(
        { date: '2026-10-18', closed: true, professionals: [] },
        '2026-10-19',
        null,
      ),
    ).toEqual({ date: '2026-10-18', closed: true, times: [] });
  });
});
