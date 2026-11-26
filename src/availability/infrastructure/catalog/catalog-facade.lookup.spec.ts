import { createFakeCatalog } from '../../../catalog/catalog.testing';
import { CatalogService } from '../../../catalog/catalog.service';
import { CatalogFacadeLookup } from './catalog-facade.lookup';

describe('CatalogFacadeLookup', () => {
  let fake: ReturnType<typeof createFakeCatalog>;
  let lookup: CatalogFacadeLookup;

  beforeEach(async () => {
    fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
    lookup = new CatalogFacadeLookup(fake.catalog);
  });

  it('answers the default location with its schedule when no id is given', async () => {
    const result = await lookup.getLocation(undefined);

    expect(result.ok && result.value).toMatchObject({
      id: 'principal',
      name: 'Principal',
      schedule: { slotIntervalMinutes: 30, startIntervalMinutes: 30 },
    });
    expect(result.ok && result.value.schedule.weekly[0]).toEqual({
      closed: true,
    });
  });

  it('turns an unknown location into Err(LocationNotFound)', async () => {
    const result = await lookup.getLocation('nope');

    expect(!result.ok && result.error.kind).toBe('not-found');
    expect(!result.ok && result.error.message).toBe(
      'Location "nope" not found',
    );
  });

  it('answers the selection with only id, name and duration, and the professionals of the location', async () => {
    const result = await lookup.resolveServices(
      ['consulta-inicial', 'servicio-basico'],
      'principal',
    );

    expect(result.ok && result.value.services).toEqual([
      { id: 'consulta-inicial', name: 'Consulta Inicial', duration: 30 },
      { id: 'servicio-basico', name: 'Servicio Básico', duration: 60 },
    ]);
    expect(result.ok && result.value.professionals).toEqual([
      { id: 'alex-garcia', name: 'Alex García' },
      { id: 'maria-lopez', name: 'María López' },
    ]);
    expect(result.ok && result.value.totalDuration).toBe(90);
  });

  it.each([
    [[], 'empty', undefined, 'validation'],
    [
      ['servicio-basico', 'servicio-basico'],
      'duplicate',
      'servicio-basico',
      'validation',
    ],
    [['nope'], 'unknown', 'nope', 'not-found'],
  ])(
    'turns the selection %j into Err(ServiceSelectionFailed) (%s)',
    async (ids, failure, serviceId, kind) => {
      const result = await lookup.resolveServices(ids, 'principal');

      expect(!result.ok && result.error).toMatchObject({
        failure,
        serviceId,
        kind,
      });
    },
  );

  it('lists the active locations as id and name', async () => {
    await expect(lookup.getActiveLocations()).resolves.toEqual([
      { id: 'principal', name: 'Principal' },
    ]);
  });

  it('answers the public settings, off by default', async () => {
    await expect(lookup.getPublicSettings()).resolves.toEqual({
      enabled: false,
      days: 7,
      serviceIds: null,
    });
  });

  it('answers the active services as id, name and duration', async () => {
    fake.serviceModel.docs.find((d) => d.id === 'sesion-expres')!.active =
      false;

    const services = await lookup.getActiveServices();

    expect(services.map((s) => s.id)).toEqual([
      'consulta-inicial',
      'servicio-basico',
      'servicio-premium',
    ]);
    expect(Object.keys(services[0])).toEqual(['id', 'name', 'duration']);
  });

  it('lets an unexpected failure through (it is a 500, not a business failure)', async () => {
    const down = new Error('db down');
    const broken = new CatalogFacadeLookup({
      getLocation: () => Promise.reject(down),
      resolveServices: () => Promise.reject(down),
    } as unknown as CatalogService);

    await expect(broken.getLocation(undefined)).rejects.toBe(down);
    await expect(broken.resolveServices(['a'], 'principal')).rejects.toBe(down);
  });
});
