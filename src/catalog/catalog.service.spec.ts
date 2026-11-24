import { CatalogService } from './catalog.service';
import { createFakeCatalog } from './catalog.testing';
import { ServiceSelectionError } from './service-selection';

describe('CatalogService', () => {
  let service: CatalogService;
  let fake: ReturnType<typeof createFakeCatalog>;

  beforeEach(async () => {
    fake = createFakeCatalog();
    service = fake.catalog;
    await service.onModuleInit();
  });

  describe('seed (onModuleInit)', () => {
    it('inserts the config defaults into the three collections', () => {
      expect(fake.professionalModel.docs.map((d) => d.id)).toEqual([
        'alex-garcia',
        'maria-lopez',
      ]);
      expect(fake.serviceModel.docs.map((d) => d.id)).toEqual([
        'consulta-inicial',
        'servicio-basico',
        'servicio-premium',
        'sesion-expres',
      ]);
      expect(fake.settingsModel.docs).toHaveLength(1);
      expect(fake.settingsModel.docs[0]).toMatchObject({
        key: 'schedule',
        slotIntervalMinutes: 30,
      });
      expect(fake.professionalModel.docs[0].active).toBe(true);
    });

    it('is idempotent and never overwrites admin edits', async () => {
      fake.professionalModel.docs[0].name = 'Edited Name';
      fake.serviceModel.docs[1].price = 9999;
      fake.serviceModel.docs[2].active = false;
      fake.settingsModel.docs[0].weekly[0] = {
        closed: false,
        open: '10:00',
        close: '12:00',
      };

      await service.onModuleInit();

      expect(fake.professionalModel.docs).toHaveLength(2);
      expect(fake.serviceModel.docs).toHaveLength(4);
      expect(fake.settingsModel.docs).toHaveLength(1);
      expect(fake.professionalModel.docs[0].name).toBe('Edited Name');
      expect(fake.serviceModel.docs[1].price).toBe(9999);
      expect(fake.serviceModel.docs[2].active).toBe(false);
      expect(fake.settingsModel.docs[0].weekly[0].open).toBe('10:00');
    });

    it('re-adds a missing default item without touching the others', async () => {
      fake.serviceModel.docs.splice(0, 1);
      fake.serviceModel.docs[0].price = 1;

      await service.onModuleInit();

      expect(fake.serviceModel.docs.map((d) => d.id).sort()).toEqual([
        'consulta-inicial',
        'servicio-basico',
        'servicio-premium',
        'sesion-expres',
      ]);
      expect(
        fake.serviceModel.docs.find((d) => d.id === 'servicio-basico')?.price,
      ).toBe(1);
    });

    it('tolerates a duplicate key error from a concurrent instance', async () => {
      const duplicate = Object.assign(new Error('E11000'), { code: 11000 });
      fake.professionalModel.updateOne.mockImplementationOnce(() => ({
        exec: () => Promise.reject(duplicate),
      }));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });

    it('rethrows other database errors', async () => {
      fake.serviceModel.updateOne.mockImplementationOnce(() => ({
        exec: () => Promise.reject(new Error('connection lost')),
      }));

      await expect(service.onModuleInit()).rejects.toThrow('connection lost');
    });
  });

  describe('getCatalog', () => {
    it('returns both professionals', async () => {
      const { professionals } = await service.getCatalog();

      expect(professionals.map((p) => p.id)).toEqual([
        'alex-garcia',
        'maria-lopez',
      ]);
      expect(professionals[0]).toEqual({
        id: 'alex-garcia',
        name: 'Alex García',
        specialty: 'Especialista',
        experience: '8 años',
        rating: 4.9,
        avatar: 'fas fa-user-tie',
        photoUrl: null,
        available: true,
        locations: ['principal'],
      });
    });

    it('returns the 4 services with their exact ids and durations', async () => {
      const { services } = await service.getCatalog();

      expect(services.map((s) => [s.id, s.duration])).toEqual([
        ['consulta-inicial', 30],
        ['servicio-basico', 60],
        ['servicio-premium', 90],
        ['sesion-expres', 20],
      ]);
      expect(services[2]).toEqual({
        id: 'servicio-premium',
        name: 'Servicio Premium',
        description:
          'Experiencia premium con atención prioritaria y resultados garantizados',
        price: 2500,
        duration: 90,
        professionals: ['alex-garcia', 'maria-lopez'],
        icon: 'fas fa-gem',
      });
    });

    it('returns a weekly schedule: Sunday closed, Saturday 9-18, weekdays 9-20', async () => {
      const { schedule } = await service.getCatalog();

      expect(schedule.weekly[0]).toEqual({ closed: true });
      expect(schedule.weekly[6]).toEqual({
        closed: false,
        open: '09:00',
        close: '18:00',
      });
      for (const day of [1, 2, 3, 4, 5] as const) {
        expect(schedule.weekly[day]).toEqual({
          closed: false,
          open: '09:00',
          close: '20:00',
        });
      }
      expect(schedule.slotIntervalMinutes).toBe(30);
      expect(Object.keys(schedule).sort()).toEqual([
        'slotIntervalMinutes',
        'startIntervalMinutes',
        'weekly',
      ]);
    });

    it('hides inactive professionals and services and leaks no internal fields', async () => {
      fake.professionalModel.docs[1].active = false;
      fake.serviceModel.docs[0].active = false;

      const { professionals, services } = await service.getCatalog();

      expect(professionals.map((p) => p.id)).toEqual(['alex-garcia']);
      expect(services.map((s) => s.id)).toEqual([
        'servicio-basico',
        'servicio-premium',
        'sesion-expres',
      ]);
      for (const item of [...professionals, ...services]) {
        expect(item).not.toHaveProperty('active');
        expect(item).not.toHaveProperty('_id');
      }
      // Services only list professionals that are still active.
      expect(services[0].professionals).toEqual(['alex-garcia']);
    });

    it('falls back to the default schedule when the settings document is missing', async () => {
      fake.settingsModel.docs.splice(0, 1);

      const { schedule } = await service.getCatalog();

      expect(schedule.weekly[0]).toEqual({ closed: true });
      expect(schedule.slotIntervalMinutes).toBe(30);
    });
  });

  describe('startIntervalMinutes', () => {
    it('is seeded as 30 and returned by both catalogs', async () => {
      expect(fake.settingsModel.docs[0].startIntervalMinutes).toBe(30);
      expect((await service.getCatalog()).schedule.startIntervalMinutes).toBe(
        30,
      );
      expect(
        (await service.getAdminCatalog()).schedule.startIntervalMinutes,
      ).toBe(30);
    });

    it('returns the stored value', async () => {
      fake.locationModel.docs[0].startIntervalMinutes = 180;

      expect((await service.getSchedule()).startIntervalMinutes).toBe(180);
    });

    it('reads a stored document without the field as 30', async () => {
      delete fake.locationModel.docs[0].startIntervalMinutes;

      expect((await service.getSchedule()).startIntervalMinutes).toBe(30);
      expect((await service.getCatalog()).schedule.startIntervalMinutes).toBe(
        30,
      );
    });
  });

  describe('publicAvailability settings', () => {
    it('reads as disabled, 7 days, all services when the document has none', async () => {
      expect(await service.getPublicAvailability()).toEqual({
        enabled: false,
        days: 7,
        serviceIds: null,
      });
      expect((await service.getAdminCatalog()).publicAvailability).toEqual({
        enabled: false,
        days: 7,
        serviceIds: null,
      });
    });

    it('returns the stored settings, and keeps them out of the public catalog', async () => {
      fake.settingsModel.docs[0].publicAvailability = {
        enabled: true,
        days: 3,
        serviceIds: ['servicio-basico'],
      };

      expect((await service.getAdminCatalog()).publicAvailability).toEqual({
        enabled: true,
        days: 3,
        serviceIds: ['servicio-basico'],
      });
      expect(await service.getCatalog()).not.toHaveProperty(
        'publicAvailability',
      );
    });
  });

  describe('getAdminCatalog', () => {
    it('includes inactive items with their active flag', async () => {
      fake.professionalModel.docs[1].active = false;
      fake.serviceModel.docs[0].active = false;

      const { professionals, services, schedule } =
        await service.getAdminCatalog();

      expect(professionals.map((p) => [p.id, p.active])).toEqual([
        ['alex-garcia', true],
        ['maria-lopez', false],
      ]);
      expect(services.map((s) => [s.id, s.active])).toEqual([
        ['consulta-inicial', false],
        ['servicio-basico', true],
        ['servicio-premium', true],
        ['sesion-expres', true],
      ]);
      expect(services[0].professionals).toEqual(['alex-garcia', 'maria-lopez']);
      expect(professionals[0]).not.toHaveProperty('_id');
      expect(schedule.slotIntervalMinutes).toBe(30);
    });
  });

  describe('findService', () => {
    it('returns the service when the id exists', async () => {
      expect((await service.findService('sesion-expres'))?.price).toBe(700);
    });

    it('returns undefined when the id does not exist', async () => {
      expect(await service.findService('unknown')).toBeUndefined();
    });

    it('returns undefined for an inactive service', async () => {
      fake.serviceModel.docs[3].active = false;

      expect(await service.findService('sesion-expres')).toBeUndefined();
    });
  });

  describe('findProfessional', () => {
    it('returns the professional when the id exists', async () => {
      expect((await service.findProfessional('maria-lopez'))?.name).toBe(
        'María López',
      );
    });

    it('returns undefined when the id does not exist', async () => {
      expect(await service.findProfessional('unknown')).toBeUndefined();
    });

    it('returns undefined for an inactive professional', async () => {
      fake.professionalModel.docs[1].active = false;

      expect(await service.findProfessional('maria-lopez')).toBeUndefined();
    });
  });

  describe('resolveServices', () => {
    it('resolves the services in the given order with accumulated totals', async () => {
      const selection = await service.resolveServices([
        'servicio-premium',
        'consulta-inicial',
        'servicio-basico',
      ]);

      expect(selection.services.map((s) => s.id)).toEqual([
        'servicio-premium',
        'consulta-inicial',
        'servicio-basico',
      ]);
      expect(selection.totalPrice).toBe(4200);
      expect(selection.totalDuration).toBe(180);
    });

    it('returns the professionals that offer every selected service', async () => {
      const selection = await service.resolveServices([
        'consulta-inicial',
        'sesion-expres',
      ]);

      expect(selection.professionals.map((p) => p.id)).toEqual([
        'alex-garcia',
        'maria-lopez',
      ]);
    });

    it('keeps only professionals common to all services', async () => {
      fake.serviceModel.docs[2].professionals = ['maria-lopez'];

      const selection = await service.resolveServices([
        'consulta-inicial',
        'servicio-premium',
      ]);

      expect(selection.professionals.map((p) => p.id)).toEqual(['maria-lopez']);
    });

    it('excludes inactive professionals', async () => {
      fake.professionalModel.docs[0].active = false;

      const selection = await service.resolveServices(['consulta-inicial']);

      expect(selection.professionals.map((p) => p.id)).toEqual(['maria-lopez']);
    });

    it('treats an inactive service as unknown', async () => {
      fake.serviceModel.docs[0].active = false;

      await expect(
        service.resolveServices(['consulta-inicial']),
      ).rejects.toMatchObject({
        failure: 'unknown',
        serviceId: 'consulta-inicial',
      });
    });

    it('rejects an empty list', async () => {
      await expect(service.resolveServices([])).rejects.toThrow(
        ServiceSelectionError,
      );
      await expect(service.resolveServices([])).rejects.toThrow(
        'debes seleccionar al menos un servicio',
      );
    });

    it('rejects an unknown service id', async () => {
      await expect(
        service.resolveServices(['consulta-inicial', 'unknown']),
      ).rejects.toMatchObject({ failure: 'unknown', serviceId: 'unknown' });
    });

    it('rejects a duplicated service id', async () => {
      await expect(
        service.resolveServices(['consulta-inicial', 'consulta-inicial']),
      ).rejects.toMatchObject({
        failure: 'duplicate',
        serviceId: 'consulta-inicial',
      });
    });
  });

  describe('getProfessionalsForService', () => {
    it('returns the professionals assigned to a known service', async () => {
      const professionals =
        await service.getProfessionalsForService('consulta-inicial');

      expect(professionals.map((p) => p.id)).toEqual([
        'alex-garcia',
        'maria-lopez',
      ]);
    });

    it('returns only active professionals', async () => {
      fake.professionalModel.docs[0].active = false;

      const professionals =
        await service.getProfessionalsForService('consulta-inicial');

      expect(professionals.map((p) => p.id)).toEqual(['maria-lopez']);
    });

    it('returns an empty list for an unknown or inactive service', async () => {
      expect(await service.getProfessionalsForService('unknown')).toEqual([]);
      fake.serviceModel.docs[0].active = false;
      expect(
        await service.getProfessionalsForService('consulta-inicial'),
      ).toEqual([]);
    });
  });
});
