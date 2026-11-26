import { businessClockAt, buildAvailability } from './availability.testing';
import { MongoOccupiedSlotsReader } from './infrastructure/persistence/mongo/mongo-occupied-slots.reader';
import { SCHEDULE } from '../catalog/catalog.config';
import { createFakeCatalog, createFakeModel } from '../catalog/catalog.testing';
import { LocationNotFoundError } from '../catalog/locations';

// 2026-10-19 is a Monday.
const MONDAY = '2026-10-19';

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

describe('AvailabilityService by location (S4)', () => {
  const build = async (bookings: object[] = []) => {
    const fake = createFakeCatalog({
      locations: [
        location('principal', 'Principal'),
        // Own interval (1 h) and own hours (10:00-13:00 on Mondays).
        location('centro', 'Centro', {
          createdAt: new Date('2026-02-01T00:00:00Z'),
          startIntervalMinutes: 60,
          weekly: {
            ...SCHEDULE.weekly,
            1: { closed: false, open: '10:00', close: '13:00' },
          },
        }),
        location('norte', 'Norte', {
          active: false,
          createdAt: new Date('2026-03-01T00:00:00Z'),
        }),
      ],
    });
    await fake.catalog.onModuleInit();
    // Alex rotates between the two locations, María stays in Principal.
    fake.professionalModel.docs[0].locationIds = ['principal', 'centro'];
    fake.professionalModel.docs[1].locationIds = ['principal'];
    const { service } = buildAvailability(
      fake.catalog,
      new MongoOccupiedSlotsReader(createFakeModel(bookings)),
      businessClockAt(new Date()),
    );
    return { service, fake };
  };

  it('uses the default location when locationId is omitted', async () => {
    const { service } = await build();

    const result = await service.getAvailability(MONDAY, ['consulta-inicial']);

    expect(result.location).toEqual({ id: 'principal', name: 'Principal' });
    expect(result.professionals.map((p) => p.id)).toEqual([
      'alex-garcia',
      'maria-lopez',
    ]);
    expect(result.professionals[0].slots.slice(0, 3)).toEqual([
      '09:00',
      '09:30',
      '10:00',
    ]);
  });

  it('offers only the professionals assigned to the location, with its own hours and interval', async () => {
    const { service } = await build();

    const result = await service.getAvailability(
      MONDAY,
      ['consulta-inicial'],
      'centro',
    );

    expect(result.location).toEqual({ id: 'centro', name: 'Centro' });
    expect(result.professionals).toEqual([
      {
        id: 'alex-garcia',
        name: 'Alex García',
        slots: ['10:00', '11:00', '12:00'],
      },
    ]);
  });

  it('a professional without locationIds works at the default location only', async () => {
    const { service, fake } = await build();
    delete fake.professionalModel.docs[1].locationIds;

    const principal = await service.getAvailability(MONDAY, [
      'consulta-inicial',
    ]);
    const centro = await service.getAvailability(
      MONDAY,
      ['consulta-inicial'],
      'centro',
    );

    expect(principal.professionals.map((p) => p.id)).toContain('maria-lopez');
    expect(centro.professionals.map((p) => p.id)).not.toContain('maria-lopez');
  });

  it.each(['norte', 'nope'])(
    'rejects an inactive or unknown location (%s) with LocationNotFoundError',
    async (id) => {
      const { service } = await build();

      await expect(
        service.getAvailability(MONDAY, ['consulta-inicial'], id),
      ).rejects.toBeInstanceOf(LocationNotFoundError);
    },
  );

  it('occupancy is per professional: a booking at Centro blocks the same time at Principal', async () => {
    const { service } = await build([
      {
        date: MONDAY,
        status: 'confirmed',
        professional: { id: 'alex-garcia', name: 'Alex García' },
        location: { id: 'centro', name: 'Centro' },
        slots: ['11:00'],
      },
    ]);

    const principal = await service.getAvailability(MONDAY, [
      'consulta-inicial',
    ]);
    const centro = await service.getAvailability(
      MONDAY,
      ['consulta-inicial'],
      'centro',
    );

    const alexAtPrincipal = principal.professionals.find(
      (p) => p.id === 'alex-garcia',
    );
    const mariaAtPrincipal = principal.professionals.find(
      (p) => p.id === 'maria-lopez',
    );
    expect(alexAtPrincipal?.slots).not.toContain('11:00');
    expect(alexAtPrincipal?.slots).toContain('10:30');
    expect(mariaAtPrincipal?.slots).toContain('11:00');
    expect(centro.professionals[0].slots).toEqual(['10:00', '12:00']);
  });

  it('a legacy booking without location still occupies its professional', async () => {
    const { service } = await build([
      {
        date: MONDAY,
        status: 'confirmed',
        professional: { id: 'alex-garcia', name: 'Alex García' },
        slots: ['10:00'],
      },
    ]);

    const centro = await service.getAvailability(
      MONDAY,
      ['consulta-inicial'],
      'centro',
    );

    expect(centro.professionals[0].slots).toEqual(['11:00', '12:00']);
  });
});
