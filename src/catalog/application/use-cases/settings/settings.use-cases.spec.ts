import { inMemoryCatalog } from '../../../infrastructure/in-memory-catalog.testing';

describe('public availability use cases (in-memory)', () => {
  let kit: ReturnType<typeof inMemoryCatalog>;

  beforeEach(() => {
    kit = inMemoryCatalog();
    kit.services.seed({ id: 'corte' });
    kit.services.seed({ id: 'tinte', active: false });
  });

  it('reads the default (off) when nothing is stored', async () => {
    await expect(kit.useCases.getPublicAvailability.execute()).resolves.toEqual(
      { ok: true, value: { enabled: false, days: 7, serviceIds: null } },
    );
  });

  it('stores and reads back the settings', async () => {
    const settings = { enabled: true, days: 10, serviceIds: ['corte'] };
    await expect(
      kit.useCases.savePublicAvailability.execute({ settings }),
    ).resolves.toEqual({ ok: true, value: settings });
    await expect(kit.useCases.getPublicAvailability.execute()).resolves.toEqual(
      { ok: true, value: settings },
    );
  });

  it('accepts a published service that is inactive (it only has to exist)', async () => {
    const result = await kit.useCases.savePublicAvailability.execute({
      settings: { enabled: true, days: 7, serviceIds: ['tinte'] },
    });
    expect(result.ok).toBe(true);
  });

  it('accepts null (all services) without looking services up', async () => {
    const empty = inMemoryCatalog();
    const result = await empty.useCases.savePublicAvailability.execute({
      settings: { enabled: true, days: 7, serviceIds: null },
    });
    expect(result).toEqual({
      ok: true,
      value: { enabled: true, days: 7, serviceIds: null },
    });
  });

  it('rejects a service that does not exist and stores nothing', async () => {
    const result = await kit.useCases.savePublicAvailability.execute({
      settings: { enabled: true, days: 7, serviceIds: ['corte', 'nope'] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('validation');
    expect(result.error.message).toBe(
      'Alguno de los servicios publicados no existe.',
    );
    expect(kit.settings.stored()).toBeNull();
  });
});
