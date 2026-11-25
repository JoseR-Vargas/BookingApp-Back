import { createFakeCatalog } from '../../../catalog/catalog.testing';
import { Result } from '../../../shared/domain/result';
import { LocatedAvailability } from '../../domain/availability';
import { CatalogFacadeLookup } from '../../infrastructure/catalog/catalog-facade.lookup';
import { InMemoryOccupiedSlotsReader } from '../../infrastructure/persistence/in-memory/in-memory-occupied-slots.reader';
import { OccupiedSlotsReader } from '../ports/occupied-slots.reader';
import { GetAvailabilityUseCase } from './get-availability.use-case';

// 2026-10-19 is a Monday, 2026-10-18 a Sunday.
const MONDAY = '2026-10-19';
const SUNDAY = '2026-10-18';

const errorOf = (result: Result<unknown>) =>
  result.ok ? undefined : result.error;
const valueOf = (result: Result<LocatedAvailability>) => {
  if (!result.ok) throw result.error;
  return result.value;
};

describe('GetAvailabilityUseCase', () => {
  let reader: InMemoryOccupiedSlotsReader;
  let findOccupied: jest.SpyInstance;
  let useCase: GetAvailabilityUseCase;

  const build = async (occupied: OccupiedSlotsReader = reader) => {
    const fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
    return new GetAvailabilityUseCase(
      new CatalogFacadeLookup(fake.catalog),
      occupied,
    );
  };

  beforeEach(async () => {
    reader = new InMemoryOccupiedSlotsReader();
    findOccupied = jest.spyOn(reader, 'findOccupied');
    useCase = await build();
  });

  it('answers the free starts of the day at the default location', async () => {
    reader.seed({
      professionalId: 'alex-garcia',
      date: MONDAY,
      slots: ['10:00', '10:30'],
      status: 'confirmed',
    });

    const day = valueOf(
      await useCase.execute({ date: MONDAY, serviceIds: ['servicio-premium'] }),
    );

    expect(day.location).toEqual({ id: 'principal', name: 'Principal' });
    expect(day.closed).toBe(false);
    expect(day.totalDuration).toBe(90);
    const alex = day.professionals.find((p) => p.id === 'alex-garcia');
    const maria = day.professionals.find((p) => p.id === 'maria-lopez');
    // 90 min = 3 blocks; the 10:00-11:00 booking blocks starts 09:00-10:30.
    expect(alex?.slots[0]).toBe('11:00');
    expect(maria?.slots[0]).toBe('09:00');
  });

  it('asks the reader once, for the date and the professionals offering ALL the services', async () => {
    await useCase.execute({
      date: MONDAY,
      serviceIds: ['servicio-basico'],
    });

    expect(findOccupied).toHaveBeenCalledTimes(1);
    expect(findOccupied).toHaveBeenCalledWith(MONDAY, [
      'alex-garcia',
      'maria-lopez',
    ]);
  });

  it('a closed day answers closed with empty slots and never asks for bookings', async () => {
    const day = valueOf(
      await useCase.execute({ date: SUNDAY, serviceIds: ['servicio-basico'] }),
    );

    expect(day.closed).toBe(true);
    expect(day.professionals.every((p) => p.slots.length === 0)).toBe(true);
    expect(findOccupied).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'abc', '2026-13-40', '2026-02-30'])(
    'fails with InvalidDate for date %p, before asking anything',
    async (date) => {
      const error = errorOf(
        await useCase.execute({
          date: date as string,
          serviceIds: ['servicio-basico'],
        }),
      );

      expect(error?.kind).toBe('validation');
      expect(error?.message).toBe('date must be a valid YYYY-MM-DD date');
      expect(findOccupied).not.toHaveBeenCalled();
    },
  );

  it.each(['nope', 'norte'])(
    'fails with a not-found error for an unknown or inactive location (%s)',
    async (locationId) => {
      const error = errorOf(
        await useCase.execute({
          date: MONDAY,
          serviceIds: ['servicio-basico'],
          locationId,
        }),
      );

      expect(error?.kind).toBe('not-found');
      expect(error?.message).toBe(`Location "${locationId}" not found`);
      expect(findOccupied).not.toHaveBeenCalled();
    },
  );

  it('checks the location before the services', async () => {
    const error = errorOf(
      await useCase.execute({
        date: MONDAY,
        serviceIds: ['nope'],
        locationId: 'nope',
      }),
    );

    expect(error?.message).toBe('Location "nope" not found');
  });

  it.each([
    [[], 'validation', 'debes seleccionar al menos un servicio'],
    [
      ['servicio-basico', 'servicio-basico'],
      'validation',
      'el servicio servicio-basico está repetido',
    ],
    [['servicio-basico', 'nope'], 'not-found', 'Service "nope" not found'],
  ])(
    'fails for the service ids %j without asking for bookings',
    async (serviceIds, kind, message) => {
      const error = errorOf(
        await useCase.execute({ date: MONDAY, serviceIds }),
      );

      expect(error?.kind).toBe(kind);
      expect(error?.message).toBe(message);
      expect(findOccupied).not.toHaveBeenCalled();
    },
  );

  it('a failure of the store is an exception, not a business failure', async () => {
    const down = new Error('db down');
    const failing = await build({ findOccupied: () => Promise.reject(down) });

    await expect(
      failing.execute({ date: MONDAY, serviceIds: ['servicio-basico'] }),
    ).rejects.toBe(down);
  });
});
