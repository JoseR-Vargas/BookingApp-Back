import { NotFoundException } from '@nestjs/common';
import { createFakeCatalog } from '../catalog/catalog.testing';
import { Availability } from './availability.service';
import {
  PublicAvailability,
  PublicAvailabilityService,
} from './public-availability.service';

type On = Extract<PublicAvailability, { enabled: true }>;

// 2026-10-19 is a Monday.
const NOW = new Date('2026-10-19T15:00:00Z'); // 12:00 in America/Montevideo (UTC-3)

const day = (
  date: string,
  professionals: { id: string; name: string; slots: string[] }[],
  closed = false,
): Availability => ({
  date,
  closed,
  services: [],
  totalDuration: 30,
  professionals,
});

describe('PublicAvailabilityService', () => {
  let fake: ReturnType<typeof createFakeCatalog>;
  let service: PublicAvailabilityService;
  const getAvailability = jest.fn();
  const saved = process.env.BUSINESS_TIMEZONE;

  const enable = (extra: object = {}) => {
    fake.settingsModel.docs[0].publicAvailability = {
      enabled: true,
      days: 3,
      serviceIds: null,
      ...extra,
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.BUSINESS_TIMEZONE;
    fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
    service = new PublicAvailabilityService(fake.catalog, {
      getAvailability,
    } as never);
    getAvailability.mockImplementation((date: string) =>
      Promise.resolve(
        day(date, [
          { id: 'alex-garcia', name: 'Alex García', slots: ['09:00', '10:00'] },
          { id: 'maria-lopez', name: 'María López', slots: ['10:00', '11:00'] },
        ]),
      ),
    );
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.BUSINESS_TIMEZONE;
    else process.env.BUSINESS_TIMEZONE = saved;
  });

  it('answers only { enabled: false } while the page is off, without touching availability', async () => {
    expect(await service.getPublicAvailability(undefined, NOW)).toEqual({
      enabled: false,
    });
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it('lists the published services and defaults to the first one', async () => {
    enable();

    const result = (await service.getPublicAvailability(undefined, NOW)) as On;

    expect(result).toMatchObject({
      enabled: true,
      serviceId: 'consulta-inicial',
    });
    expect(result.services?.map((s) => s.id)).toEqual([
      'consulta-inicial',
      'servicio-basico',
      'servicio-premium',
      'sesion-expres',
    ]);
    expect(result.services?.[0]).toEqual({
      id: 'consulta-inicial',
      name: 'Consulta Inicial',
      duration: 30,
    });
  });

  it('returns `days` days from today, merging the free professionals of every time', async () => {
    enable({ days: 2 });
    process.env.BUSINESS_TIMEZONE = 'America/Montevideo';

    const result = (await service.getPublicAvailability(
      'servicio-basico',
      NOW,
    )) as On;

    expect(getAvailability.mock.calls).toEqual([
      ['2026-10-19', ['servicio-basico'], 'principal'],
      ['2026-10-20', ['servicio-basico'], 'principal'],
    ]);
    expect(result.days?.map((d) => d.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
    ]);
    expect(result.days?.[1].times).toEqual([
      {
        time: '09:00',
        professionals: [{ id: 'alex-garcia', name: 'Alex García' }],
      },
      {
        time: '10:00',
        professionals: [
          { id: 'alex-garcia', name: 'Alex García' },
          { id: 'maria-lopez', name: 'María López' },
        ],
      },
      {
        time: '11:00',
        professionals: [{ id: 'maria-lopez', name: 'María López' }],
      },
    ]);
  });

  it('drops the times of today that already passed, in the business timezone', async () => {
    enable({ days: 2 });
    process.env.BUSINESS_TIMEZONE = 'America/Montevideo';
    getAvailability.mockImplementation((date: string) =>
      Promise.resolve(
        day(date, [
          {
            id: 'alex-garcia',
            name: 'Alex García',
            slots: ['09:00', '12:00', '12:30', '15:00'],
          },
        ]),
      ),
    );

    const result = (await service.getPublicAvailability(undefined, NOW)) as On;

    expect(result.days?.[0].times.map((t) => t.time)).toEqual([
      '12:30',
      '15:00',
    ]);
    expect(result.days?.[1].times.map((t) => t.time)).toEqual([
      '09:00',
      '12:00',
      '12:30',
      '15:00',
    ]);
  });

  it('does not filter hours when no business timezone is set (UTC date for "today")', async () => {
    enable({ days: 1 });
    getAvailability.mockResolvedValue(
      day('2026-10-19', [
        { id: 'alex-garcia', name: 'Alex García', slots: ['09:00'] },
      ]),
    );

    const result = (await service.getPublicAvailability(undefined, NOW)) as On;

    expect(getAvailability).toHaveBeenCalledWith(
      '2026-10-19',
      ['consulta-inicial'],
      'principal',
    );
    expect(result.days?.[0].times.map((t) => t.time)).toEqual(['09:00']);
  });

  it('marks a closed day and a full day differently', async () => {
    enable({ days: 2 });
    getAvailability
      .mockResolvedValueOnce(day('2026-10-19', [], true))
      .mockResolvedValueOnce(
        day('2026-10-20', [
          { id: 'alex-garcia', name: 'Alex García', slots: [] },
        ]),
      );

    const result = (await service.getPublicAvailability(undefined, NOW)) as On;

    expect(result.days).toEqual([
      { date: '2026-10-19', closed: true, times: [] },
      { date: '2026-10-20', closed: false, times: [] },
    ]);
  });

  it('publishes only the chosen services and answers 404 for any other', async () => {
    enable({ serviceIds: ['servicio-basico', 'servicio-premium'] });

    const result = (await service.getPublicAvailability(undefined, NOW)) as On;
    expect(result.services?.map((s) => s.id)).toEqual([
      'servicio-basico',
      'servicio-premium',
    ]);
    expect(result.serviceId).toBe('servicio-basico');

    await expect(
      service.getPublicAvailability('sesion-expres', NOW),
    ).rejects.toThrow(NotFoundException);
    await expect(service.getPublicAvailability('nope', NOW)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('skips inactive services and ids that no longer exist', async () => {
    enable({ serviceIds: ['servicio-basico', 'gone'] });
    fake.serviceModel.docs.find((d) => d.id === 'servicio-basico')!.active =
      false;

    const result = (await service.getPublicAvailability(undefined, NOW)) as On;

    expect(result).toEqual({
      enabled: true,
      services: [],
      serviceId: null,
      locationId: 'principal',
      locations: [{ id: 'principal', name: 'Principal' }],
      days: [],
    });
    expect(getAvailability).not.toHaveBeenCalled();
  });

  it('exposes no prices, bookings or client data', async () => {
    enable({ days: 1 });

    const result = (await service.getPublicAvailability(undefined, NOW)) as On;

    expect(JSON.stringify(result)).not.toMatch(
      /price|client|email|phone|slots/,
    );
  });
});
