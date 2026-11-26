import { createFakeCatalog } from '../../../catalog/catalog.testing';
import { LocatedAvailability } from '../../domain/availability';
import { CatalogFacadeLookup } from '../../infrastructure/catalog/catalog-facade.lookup';
import { InMemoryAvailabilityCache } from '../../infrastructure/cache/in-memory-availability.cache';
import { InMemoryOccupiedSlotsReader } from '../../infrastructure/persistence/in-memory/in-memory-occupied-slots.reader';
import { GetAvailabilityUseCase } from './get-availability.use-case';

const MONDAY = '2026-10-19';

describe('GetAvailabilityUseCase with a cache (spec 22)', () => {
  let reader: InMemoryOccupiedSlotsReader;
  let findOccupied: jest.SpyInstance;
  let cache: InMemoryAvailabilityCache;
  let useCase: GetAvailabilityUseCase;
  let now: number;
  let tenant: string;

  beforeEach(async () => {
    now = Date.parse('2026-11-26T10:00:00Z');
    tenant = 't1';
    reader = new InMemoryOccupiedSlotsReader();
    findOccupied = jest.spyOn(reader, 'findOccupied');
    cache = new InMemoryAvailabilityCache(
      { now: () => new Date(now) },
      { current: () => ({ id: tenant, slug: tenant }) },
      60_000,
    );
    const fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
    useCase = new GetAvailabilityUseCase(
      new CatalogFacadeLookup(fake.catalog),
      reader,
      cache,
    );
  });

  const ask = async (serviceIds = ['servicio-basico']) => {
    const result = await useCase.execute({ date: MONDAY, serviceIds });
    if (!result.ok) throw result.error;
    return result.value;
  };
  const slotsOfAlex = (day: LocatedAvailability) =>
    day.professionals.find((p) => p.id === 'alex-garcia')!.slots;

  it('does not read the bookings again for a second request inside the TTL', async () => {
    const first = await ask();
    const second = await ask();

    expect(second).toEqual(first);
    expect(findOccupied).toHaveBeenCalledTimes(1);
  });

  it('reads again after the TTL', async () => {
    await ask();
    now += 60_000;
    await ask();
    expect(findOccupied).toHaveBeenCalledTimes(2);
  });

  it('a booking plus an invalidation shows the taken slot at once', async () => {
    const before = await ask();
    expect(slotsOfAlex(before)).toContain('10:00');

    reader.seed({
      professionalId: 'alex-garcia',
      date: MONDAY,
      slots: ['10:00'],
      status: 'confirmed',
    });
    cache.invalidateBusiness(); // what the booking writer does

    expect(slotsOfAlex(await ask())).not.toContain('10:00');
  });

  it('does not share the answer with another business', async () => {
    await ask();
    tenant = 't2';
    await ask();
    expect(findOccupied).toHaveBeenCalledTimes(2);
  });

  it('never caches an error', async () => {
    const failure = () =>
      useCase.execute({ date: MONDAY, serviceIds: ['nope'] });
    expect((await failure()).ok).toBe(false);
    expect(cache.size()).toBe(0);
    expect((await failure()).ok).toBe(false);
  });
});
