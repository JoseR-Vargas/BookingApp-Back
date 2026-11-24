import { SCHEDULE } from './catalog.config';
import { createFakeCatalog } from './catalog.testing';
import { LocationNotFoundError } from './locations';

const STORED_WEEKLY = {
  ...SCHEDULE.weekly,
  1: { closed: false, open: '10:00', close: '14:00' },
} as const;

const centro = (extra: object = {}) => ({
  id: 'centro',
  name: 'Centro',
  address: 'Av. Central 123',
  active: true,
  weekly: SCHEDULE.weekly,
  slotIntervalMinutes: 30,
  startIntervalMinutes: 60,
  createdAt: new Date('2026-02-01T00:00:00Z'),
  ...extra,
});

const principal = (extra: object = {}) => ({
  id: 'principal',
  name: 'Principal',
  address: '',
  active: true,
  weekly: SCHEDULE.weekly,
  slotIntervalMinutes: 30,
  startIntervalMinutes: 30,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...extra,
});

describe('locations: startup migration (S1)', () => {
  it('creates "principal" copying the stored schedule when locations is empty', async () => {
    const fake = createFakeCatalog({
      settings: [
        {
          key: 'schedule',
          weekly: STORED_WEEKLY,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 90,
        },
      ],
    });

    await fake.catalog.onModuleInit();

    expect(fake.locationModel.docs).toHaveLength(1);
    expect(fake.locationModel.docs[0]).toMatchObject({
      id: 'principal',
      name: 'Principal',
      address: '',
      active: true,
      weekly: STORED_WEEKLY,
      slotIntervalMinutes: 30,
      startIntervalMinutes: 90,
    });
    expect(
      Number.isNaN(new Date(fake.locationModel.docs[0].createdAt).getTime()),
    ).toBe(false);
    // Copy, not move: the legacy document keeps its schedule.
    expect(fake.settingsModel.docs[0].weekly).toEqual(STORED_WEEKLY);
  });

  it('uses the seed schedule when no schedule was ever stored', async () => {
    const fake = createFakeCatalog();

    await fake.catalog.onModuleInit();

    expect(fake.locationModel.docs).toHaveLength(1);
    expect(fake.locationModel.docs[0]).toMatchObject({
      id: 'principal',
      weekly: SCHEDULE.weekly,
      slotIntervalMinutes: 30,
      startIntervalMinutes: 30,
    });
  });

  it('is idempotent: an already migrated database is not touched', async () => {
    const fake = createFakeCatalog({
      settings: [
        {
          key: 'schedule',
          weekly: STORED_WEEKLY,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 90,
        },
      ],
      locations: [
        principal({ name: 'Casa central', startIntervalMinutes: 60 }),
      ],
    });

    await fake.catalog.onModuleInit();
    await fake.catalog.onModuleInit();

    expect(fake.locationModel.docs).toHaveLength(1);
    expect(fake.locationModel.docs[0]).toMatchObject({
      name: 'Casa central',
      startIntervalMinutes: 60,
    });
  });

  it('does not recreate "principal" when other locations already exist', async () => {
    const fake = createFakeCatalog({ locations: [centro()] });

    await fake.catalog.onModuleInit();

    expect(fake.locationModel.docs.map((d) => d.id)).toEqual(['centro']);
  });
});

describe('locations: catalog read (S2, S3)', () => {
  it('serves the active locations with their schedule and a default-location top-level schedule', async () => {
    const fake = createFakeCatalog({
      locations: [
        principal(),
        centro(),
        centro({ id: 'norte', name: 'Norte', active: false }),
      ],
    });
    await fake.catalog.onModuleInit();

    const catalog = await fake.catalog.getCatalog();

    expect(catalog.locations).toEqual([
      {
        id: 'principal',
        name: 'Principal',
        address: '',
        schedule: {
          weekly: SCHEDULE.weekly,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 30,
        },
      },
      {
        id: 'centro',
        name: 'Centro',
        address: 'Av. Central 123',
        schedule: {
          weekly: SCHEDULE.weekly,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 60,
        },
      },
    ]);
    expect(catalog.schedule.startIntervalMinutes).toBe(30);
  });

  it('reads a professional without locationIds as working at the default location', async () => {
    const fake = createFakeCatalog({
      locations: [principal(), centro()],
    });
    await fake.catalog.onModuleInit();
    // Alex rotates; María keeps the legacy shape (no field).
    fake.professionalModel.docs[0].locationIds = ['principal', 'centro'];

    const { professionals } = await fake.catalog.getCatalog();

    expect(professionals.map((p) => [p.id, p.locations])).toEqual([
      ['alex-garcia', ['principal', 'centro']],
      ['maria-lopez', ['principal']],
    ]);
  });

  it('lists only active location ids per professional in the public catalog', async () => {
    const fake = createFakeCatalog({
      locations: [principal(), centro({ active: false })],
    });
    await fake.catalog.onModuleInit();
    fake.professionalModel.docs[0].locationIds = ['principal', 'centro'];

    const { professionals } = await fake.catalog.getCatalog();

    expect(professionals[0].locations).toEqual(['principal']);
  });

  it('the default location is the OLDEST active one', async () => {
    const fake = createFakeCatalog({
      locations: [
        centro(),
        principal({ active: false }),
        centro({ id: 'sur', name: 'Sur', createdAt: new Date('2026-03-01') }),
      ],
    });
    await fake.catalog.onModuleInit();

    expect(await fake.catalog.getDefaultLocationId()).toBe('centro');
    expect(
      (await fake.catalog.getCatalog()).schedule.startIntervalMinutes,
    ).toBe(60);
  });

  it("the admin catalog lists every location with `active` and each professional's ids", async () => {
    const fake = createFakeCatalog({
      locations: [principal(), centro({ active: false })],
    });
    await fake.catalog.onModuleInit();
    fake.professionalModel.docs[0].locationIds = ['principal', 'centro'];

    const admin = await fake.catalog.getAdminCatalog();

    expect(admin.locations.map((l) => [l.id, l.active])).toEqual([
      ['principal', true],
      ['centro', false],
    ]);
    expect(admin.locations[1]).toMatchObject({
      name: 'Centro',
      address: 'Av. Central 123',
      schedule: { startIntervalMinutes: 60 },
    });
    expect(admin.professionals.map((p) => p.locations)).toEqual([
      ['principal', 'centro'],
      ['principal'],
    ]);
    expect(admin.schedule.startIntervalMinutes).toBe(30);
  });
});

describe('locations: getSchedule(locationId) (S1)', () => {
  const build = async () => {
    const fake = createFakeCatalog({
      locations: [
        principal(),
        centro(),
        centro({ id: 'norte', name: 'Norte', active: false }),
      ],
    });
    await fake.catalog.onModuleInit();
    return fake.catalog;
  };

  it('returns the default location schedule when omitted', async () => {
    expect((await (await build()).getSchedule()).startIntervalMinutes).toBe(30);
  });

  it("returns that location's own schedule", async () => {
    expect(
      (await (await build()).getSchedule('centro')).startIntervalMinutes,
    ).toBe(60);
  });

  it.each(['norte', 'nope'])(
    'throws LocationNotFoundError for an inactive or unknown id (%s)',
    async (id) => {
      const error = await (await build()).getSchedule(id).catch((e) => e);
      expect(error).toBeInstanceOf(LocationNotFoundError);
      expect(error).toMatchObject({
        locationId: id,
        message: `Location "${id}" not found`,
      });
    },
  );

  it('falls back to the legacy schedule when locations were never migrated', async () => {
    const fake = createFakeCatalog({
      settings: [
        {
          key: 'schedule',
          weekly: STORED_WEEKLY,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 120,
        },
      ],
    });

    const schedule = await fake.catalog.getSchedule();

    expect(schedule.startIntervalMinutes).toBe(120);
    expect(schedule.weekly).toEqual(STORED_WEEKLY);
  });
});
