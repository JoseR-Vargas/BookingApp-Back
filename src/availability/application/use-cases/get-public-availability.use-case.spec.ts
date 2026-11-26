import { SCHEDULE } from '../../../catalog/catalog.config';
import { createFakeCatalog } from '../../../catalog/catalog.testing';
import { ok, Result } from '../../../shared/domain/result';
import { Availability, PublicAvailability } from '../../domain/availability';
import { CatalogFacadeLookup } from '../../infrastructure/catalog/catalog-facade.lookup';
import { SystemBusinessClock } from '../../infrastructure/system-business-clock';
import { GetAvailabilityUseCase } from './get-availability.use-case';
import { GetPublicAvailabilityUseCase } from './get-public-availability.use-case';

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

describe('GetPublicAvailabilityUseCase', () => {
  let fake: ReturnType<typeof createFakeCatalog>;
  let useCase: GetPublicAvailabilityUseCase;
  const execute = jest.fn();
  const saved = process.env.BUSINESS_TIMEZONE;

  const enable = (extra: object = {}) => {
    fake.settingsModel.docs[0].publicAvailability = {
      enabled: true,
      days: 3,
      serviceIds: null,
      ...extra,
    };
  };

  const run = async (serviceId?: string, locationId?: string) => {
    const result: Result<PublicAvailability> = await useCase.execute({
      serviceId,
      locationId,
    });
    if (!result.ok) throw result.error;
    return result.value as On;
  };

  const failure = async (serviceId?: string, locationId?: string) => {
    const result = await useCase.execute({ serviceId, locationId });
    if (result.ok) throw new Error('expected an Err');
    return result.error;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.BUSINESS_TIMEZONE;
    fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
    useCase = new GetPublicAvailabilityUseCase(
      new CatalogFacadeLookup(fake.catalog),
      new SystemBusinessClock({ now: () => NOW }),
      { execute } as unknown as GetAvailabilityUseCase,
    );
    execute.mockImplementation(({ date }: { date: string }) =>
      Promise.resolve(
        ok(
          day(date, [
            {
              id: 'alex-garcia',
              name: 'Alex García',
              slots: ['09:00', '10:00'],
            },
            {
              id: 'maria-lopez',
              name: 'María López',
              slots: ['10:00', '11:00'],
            },
          ]),
        ),
      ),
    );
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.BUSINESS_TIMEZONE;
    else process.env.BUSINESS_TIMEZONE = saved;
  });

  it('answers only { enabled: false } while the page is off, without touching availability', async () => {
    expect(await useCase.execute({})).toEqual({
      ok: true,
      value: { enabled: false },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('lists the published services and defaults to the first one', async () => {
    enable();

    const result = await run();

    expect(result).toMatchObject({
      enabled: true,
      serviceId: 'consulta-inicial',
    });
    expect(result.services.map((s) => s.id)).toEqual([
      'consulta-inicial',
      'servicio-basico',
      'servicio-premium',
      'sesion-expres',
    ]);
    expect(result.services[0]).toEqual({
      id: 'consulta-inicial',
      name: 'Consulta Inicial',
      duration: 30,
    });
  });

  it('returns `days` days from today, merging the free professionals of every time', async () => {
    enable({ days: 2 });
    process.env.BUSINESS_TIMEZONE = 'America/Montevideo';

    const result = await run('servicio-basico');

    expect(execute.mock.calls).toEqual([
      [
        {
          date: '2026-10-19',
          serviceIds: ['servicio-basico'],
          locationId: 'principal',
        },
      ],
      [
        {
          date: '2026-10-20',
          serviceIds: ['servicio-basico'],
          locationId: 'principal',
        },
      ],
    ]);
    expect(result.days.map((d) => d.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
    ]);
    expect(result.days[1].times).toEqual([
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
    execute.mockImplementation(({ date }: { date: string }) =>
      Promise.resolve(
        ok(
          day(date, [
            {
              id: 'alex-garcia',
              name: 'Alex García',
              slots: ['09:00', '12:00', '12:30', '15:00'],
            },
          ]),
        ),
      ),
    );

    const result = await run();

    expect(result.days[0].times.map((t) => t.time)).toEqual(['12:30', '15:00']);
    expect(result.days[1].times.map((t) => t.time)).toEqual([
      '09:00',
      '12:00',
      '12:30',
      '15:00',
    ]);
  });

  it('does not filter hours when no business timezone is set (UTC date for "today")', async () => {
    enable({ days: 1 });
    execute.mockResolvedValue(
      ok(
        day('2026-10-19', [
          { id: 'alex-garcia', name: 'Alex García', slots: ['09:00'] },
        ]),
      ),
    );

    const result = await run();

    expect(execute).toHaveBeenCalledWith({
      date: '2026-10-19',
      serviceIds: ['consulta-inicial'],
      locationId: 'principal',
    });
    expect(result.days[0].times.map((t) => t.time)).toEqual(['09:00']);
  });

  it('marks a closed day and a full day differently', async () => {
    enable({ days: 2 });
    execute
      .mockResolvedValueOnce(ok(day('2026-10-19', [], true)))
      .mockResolvedValueOnce(
        ok(
          day('2026-10-20', [
            { id: 'alex-garcia', name: 'Alex García', slots: [] },
          ]),
        ),
      );

    const result = await run();

    expect(result.days).toEqual([
      { date: '2026-10-19', closed: true, times: [] },
      { date: '2026-10-20', closed: false, times: [] },
    ]);
  });

  it('publishes only the chosen services and fails with not-found for any other', async () => {
    enable({ serviceIds: ['servicio-basico', 'servicio-premium'] });

    const result = await run();
    expect(result.services.map((s) => s.id)).toEqual([
      'servicio-basico',
      'servicio-premium',
    ]);
    expect(result.serviceId).toBe('servicio-basico');

    for (const id of ['sesion-expres', 'nope']) {
      const error = await failure(id);
      expect(error.kind).toBe('not-found');
      expect(error.message).toBe(`Service "${id}" not found`);
    }
  });

  it('skips inactive services and ids that no longer exist', async () => {
    enable({ serviceIds: ['servicio-basico', 'gone'] });
    fake.serviceModel.docs.find((d) => d.id === 'servicio-basico')!.active =
      false;

    const result = await run();

    expect(result).toEqual({
      enabled: true,
      services: [],
      serviceId: null,
      locationId: 'principal',
      locations: [{ id: 'principal', name: 'Principal' }],
      days: [],
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('exposes no prices, bookings or client data', async () => {
    enable({ days: 1 });

    const result = await run();

    expect(JSON.stringify(result)).not.toMatch(
      /price|client|email|phone|slots/,
    );
  });

  it('fails with the error of a day that cannot be computed', async () => {
    enable({ days: 2 });
    const { InvalidDate } = await import('../../domain/availability.errors');
    execute.mockResolvedValueOnce(ok(day('2026-10-19', [])));
    execute.mockResolvedValueOnce({ ok: false, error: new InvalidDate() });

    const error = await failure();

    expect(error).toBeInstanceOf(InvalidDate);
  });

  it('a failure of the store is an exception', async () => {
    enable();
    const down = new Error('db down');
    execute.mockRejectedValue(down);

    await expect(useCase.execute({})).rejects.toBe(down);
  });
});

/** Public availability by location (S8 of the locations spec), ported from the old service spec. */
describe('GetPublicAvailabilityUseCase by location', () => {
  let fake: ReturnType<typeof createFakeCatalog>;
  let useCase: GetPublicAvailabilityUseCase;
  const execute = jest.fn();

  const location = (id: string, name: string, extra: object = {}) => ({
    id,
    name,
    address: '',
    active: true,
    weekly: SCHEDULE.weekly,
    slotIntervalMinutes: 30,
    startIntervalMinutes: 30,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...extra,
  });

  const run = async (serviceId?: string, locationId?: string) => {
    const result = await useCase.execute({ serviceId, locationId });
    if (!result.ok) throw result.error;
    return result.value as On;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.BUSINESS_TIMEZONE;
    fake = createFakeCatalog({
      locations: [
        location('principal', 'Principal'),
        location('centro', 'Centro', {
          createdAt: new Date('2026-02-01T00:00:00Z'),
        }),
        location('norte', 'Norte', {
          active: false,
          createdAt: new Date('2026-03-01T00:00:00Z'),
        }),
      ],
    });
    await fake.catalog.onModuleInit();
    fake.settingsModel.docs[0].publicAvailability = {
      enabled: true,
      days: 1,
      serviceIds: null,
    };
    useCase = new GetPublicAvailabilityUseCase(
      new CatalogFacadeLookup(fake.catalog),
      new SystemBusinessClock({ now: () => NOW }),
      { execute } as unknown as GetAvailabilityUseCase,
    );
    execute.mockImplementation(({ date }: { date: string }) =>
      Promise.resolve(
        ok(
          day(date, [
            { id: 'alex-garcia', name: 'Alex García', slots: ['16:00'] },
          ]),
        ),
      ),
    );
  });

  it('lists the active locations and answers the default one when no locationId is given', async () => {
    const result = await run();

    expect(result.locations).toEqual([
      { id: 'principal', name: 'Principal' },
      { id: 'centro', name: 'Centro' },
    ]);
    expect(result.locationId).toBe('principal');
    expect(execute).toHaveBeenCalledWith({
      date: '2026-10-19',
      serviceIds: ['consulta-inicial'],
      locationId: 'principal',
    });
  });

  it('computes the days for the requested location', async () => {
    const result = await run('servicio-basico', 'centro');

    expect(result.locationId).toBe('centro');
    expect(result.serviceId).toBe('servicio-basico');
    expect(execute).toHaveBeenCalledWith({
      date: '2026-10-19',
      serviceIds: ['servicio-basico'],
      locationId: 'centro',
    });
    // Settings stay global: same services whatever the location.
    expect(result.services.map((s) => s.id)).toEqual([
      'consulta-inicial',
      'servicio-basico',
      'servicio-premium',
      'sesion-expres',
    ]);
  });

  it.each(['nope', 'norte'])(
    'fails with not-found `Location "%s" not found` for an unknown or inactive location',
    async (id) => {
      const result = await useCase.execute({ locationId: id });

      expect(!result.ok && result.error.kind).toBe('not-found');
      expect(!result.ok && result.error.message).toBe(
        `Location "${id}" not found`,
      );
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it('stays { enabled: false } while the page is off, whatever the location', async () => {
    fake.settingsModel.docs[0].publicAvailability = {
      enabled: false,
      days: 1,
      serviceIds: null,
    };

    expect(await useCase.execute({ locationId: 'nope' })).toEqual({
      ok: true,
      value: { enabled: false },
    });
  });

  it('answers the locations even when no service is published', async () => {
    fake.settingsModel.docs[0].publicAvailability = {
      enabled: true,
      days: 1,
      serviceIds: [],
    };
    fake.serviceModel.docs.forEach((d) => (d.active = false));

    expect(await run()).toEqual({
      enabled: true,
      services: [],
      serviceId: null,
      locationId: 'principal',
      locations: [
        { id: 'principal', name: 'Principal' },
        { id: 'centro', name: 'Centro' },
      ],
      days: [],
    });
  });
});
