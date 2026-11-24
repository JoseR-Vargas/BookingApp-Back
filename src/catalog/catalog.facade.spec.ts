import { ServiceSelectionError } from './service-selection';
import { createFakeCatalog } from './catalog.testing';

/** The facade keeps the exceptions and shapes the unmigrated modules expect. */
describe('CatalogService facade (temporary)', () => {
  let fake: ReturnType<typeof createFakeCatalog>;

  beforeEach(async () => {
    fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
  });

  it.each([
    [[], 'empty', undefined],
    [['servicio-basico', 'servicio-basico'], 'duplicate', 'servicio-basico'],
    [['nope'], 'unknown', 'nope'],
  ])(
    'resolveServices(%j) throws a ServiceSelectionError (%s)',
    async (ids, failure, serviceId) => {
      const error = await fake.catalog.resolveServices(ids).catch((e) => e);
      expect(error).toBeInstanceOf(ServiceSelectionError);
      expect(error.failure).toBe(failure);
      expect(error.serviceId).toBe(serviceId);
    },
  );

  it('getProfessionalPhoto answers null without photo, findProfessional/findService undefined when unknown', async () => {
    await expect(
      fake.catalog.getProfessionalPhoto('alex-garcia'),
    ).resolves.toBeNull();
    await expect(
      fake.catalog.findProfessional('nobody'),
    ).resolves.toBeUndefined();
    await expect(fake.catalog.findService('nobody')).resolves.toBeUndefined();
  });

  it('worksAtLocation answers a boolean and getProfessionalsForService a list', async () => {
    await expect(
      fake.catalog.worksAtLocation('alex-garcia', 'principal'),
    ).resolves.toBe(true);
    await expect(
      fake.catalog.worksAtLocation('nobody', 'principal'),
    ).resolves.toBe(false);
    await expect(
      fake.catalog.getProfessionalsForService('servicio-basico'),
    ).resolves.toHaveLength(2);
  });
});
