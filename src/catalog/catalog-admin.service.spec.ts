import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CatalogAdminService } from './catalog-admin.service';
import { createFakeCatalog } from './catalog.testing';
import { SCHEDULE } from './catalog.config';

describe('CatalogAdminService', () => {
  let fake: ReturnType<typeof createFakeCatalog>;
  let admin: CatalogAdminService;

  beforeEach(async () => {
    fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
    admin = new CatalogAdminService(
      fake.professionalModel,
      fake.serviceModel,
      fake.settingsModel,
      fake.bookingModel,
      fake.locationModel,
    );
  });

  describe('createProfessional', () => {
    it('stores the professional with a slug id and the default rating/avatar', async () => {
      const created = await admin.createProfessional({
        name: 'Ana Ruiz',
        specialty: 'Colorist',
        experience: '3 años',
        active: true,
      });

      expect(created).toEqual({
        id: 'ana-ruiz',
        name: 'Ana Ruiz',
        specialty: 'Colorist',
        experience: '3 años',
        rating: 5,
        avatar: 'fas fa-user',
        photoUrl: null,
        active: true,
        locations: ['principal'],
      });
      expect(fake.professionalModel.docs).toHaveLength(3);
      expect(fake.professionalModel.docs[2]).toMatchObject({ id: 'ana-ruiz' });
    });

    it('suffixes -2, -3 on slug collisions and never overwrites', async () => {
      const input = {
        name: 'Alex García',
        specialty: '',
        experience: '',
        active: true,
      };

      const second = await admin.createProfessional(input);
      const third = await admin.createProfessional(input);

      expect(second.id).toBe('alex-garcia-2');
      expect(third.id).toBe('alex-garcia-3');
      expect(fake.professionalModel.docs[0]).toMatchObject({
        id: 'alex-garcia',
        specialty: 'Especialista',
        rating: 4.9,
      });
    });

    it('collides with inactive professionals too', async () => {
      fake.professionalModel.docs[0].active = false;

      const created = await admin.createProfessional({
        name: 'Alex Garcia',
        specialty: '',
        experience: '',
        active: true,
      });

      expect(created.id).toBe('alex-garcia-2');
    });

    it('moves to the next suffix when a concurrent insert wins the key', async () => {
      const duplicate = Object.assign(new Error('E11000'), { code: 11000 });
      fake.professionalModel.updateOne.mockImplementationOnce(() => ({
        exec: () => Promise.reject(duplicate),
      }));

      const created = await admin.createProfessional({
        name: 'Ana',
        specialty: '',
        experience: '',
        active: true,
      });

      expect(created.id).toBe('ana-2');
    });

    it('falls back to a generic id when the name has no alphanumerics', async () => {
      const created = await admin.createProfessional({
        name: '???',
        specialty: '',
        experience: '',
        active: true,
      });

      expect(created.id).toBe('professional');
    });
  });

  describe('updateProfessional', () => {
    it('updates only the given fields and keeps the id', async () => {
      const updated = await admin.updateProfessional('maria-lopez', {
        name: 'María L.',
        active: false,
      });

      expect(updated).toEqual({
        id: 'maria-lopez',
        name: 'María L.',
        specialty: 'Consultora',
        experience: '6 años',
        rating: 4.8,
        avatar: 'fas fa-user',
        photoUrl: null,
        active: false,
        locations: ['principal'],
      });
    });

    it('can reactivate a deactivated professional', async () => {
      await admin.updateProfessional('maria-lopez', { active: false });

      const updated = await admin.updateProfessional('maria-lopez', {
        active: true,
      });

      expect(updated.active).toBe(true);
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(
        admin.updateProfessional('nobody', { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createService', () => {
    const input = {
      name: 'Corte Clásico',
      description: 'Corte a tijera',
      price: 1500,
      duration: 45,
      professionals: ['alex-garcia'],
      active: true,
    };

    it('stores the service with a slug id and the default icon', async () => {
      const created = await admin.createService(input);

      expect(created).toEqual({
        id: 'corte-clasico',
        ...input,
        icon: 'fas fa-star',
      });
      expect(fake.serviceModel.docs[4]).toMatchObject({ id: 'corte-clasico' });
    });

    it('suffixes the id on collision', async () => {
      await admin.createService(input);

      const second = await admin.createService(input);

      expect(second.id).toBe('corte-clasico-2');
    });

    it('rejects professionals that do not exist, without inserting', async () => {
      await expect(
        admin.createService({
          ...input,
          professionals: ['alex-garcia', 'ghost', 'phantom'],
        }),
      ).rejects.toThrow(/professionals not found: ghost, phantom/);
      expect(fake.serviceModel.docs).toHaveLength(4);
    });

    it('accepts inactive professionals as existing', async () => {
      fake.professionalModel.docs[1].active = false;

      await expect(
        admin.createService({ ...input, professionals: ['maria-lopez'] }),
      ).resolves.toMatchObject({ professionals: ['maria-lopez'] });
    });
  });

  describe('updateService', () => {
    it('updates the given fields only', async () => {
      const updated = await admin.updateService('servicio-basico', {
        price: 1300,
        duration: 75,
        professionals: ['maria-lopez'],
      });

      expect(updated).toMatchObject({
        id: 'servicio-basico',
        name: 'Servicio Básico',
        price: 1300,
        duration: 75,
        professionals: ['maria-lopez'],
        icon: 'fas fa-star',
        active: true,
      });
    });

    it('toggles active', async () => {
      const off = await admin.updateService('sesion-expres', { active: false });
      const on = await admin.updateService('sesion-expres', { active: true });

      expect(off.active).toBe(false);
      expect(on.active).toBe(true);
    });

    it('throws NotFound for an unknown id', async () => {
      await expect(admin.updateService('nope', { price: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects unknown professionals and leaves the service untouched', async () => {
      await expect(
        admin.updateService('servicio-basico', { professionals: ['ghost'] }),
      ).rejects.toThrow(BadRequestException);
      expect(fake.serviceModel.docs[1].professionals).toEqual([
        'alex-garcia',
        'maria-lopez',
      ]);
    });
  });

  describe('saveSchedule', () => {
    const weekly = {
      ...SCHEDULE.weekly,
      6: { closed: true as const },
      1: { closed: false as const, open: '10:00', close: '18:00' },
    };

    it('replaces the stored weekly schedule and keeps the 30 min interval', async () => {
      const saved = await admin.saveSchedule(weekly);

      expect(saved).toEqual({
        weekly,
        slotIntervalMinutes: 30,
        startIntervalMinutes: 30,
      });
      // The schedule lives in the default location; the legacy document stays.
      expect(fake.locationModel.docs).toHaveLength(1);
      expect(fake.locationModel.docs[0]).toMatchObject({
        id: 'principal',
        weekly,
        slotIntervalMinutes: 30,
      });
      expect(fake.settingsModel.docs[0].weekly).toEqual(SCHEDULE.weekly);
      expect((await fake.catalog.getSchedule()).weekly[6]).toEqual({
        closed: true,
      });
    });

    it('stores and returns a new start interval', async () => {
      const saved = await admin.saveSchedule(weekly, 180);

      expect(saved).toEqual({
        weekly,
        slotIntervalMinutes: 30,
        startIntervalMinutes: 180,
      });
      expect(fake.locationModel.docs[0].startIntervalMinutes).toBe(180);
      expect((await fake.catalog.getSchedule()).startIntervalMinutes).toBe(180);
    });

    it('keeps the stored start interval when none is given', async () => {
      await admin.saveSchedule(weekly, 180);

      const saved = await admin.saveSchedule(weekly);

      expect(saved.startIntervalMinutes).toBe(180);
      expect(fake.locationModel.docs[0].startIntervalMinutes).toBe(180);
    });

    it('creates the principal location when nothing was stored yet', async () => {
      fake.settingsModel.docs.splice(0, 1);
      fake.locationModel.docs.splice(0, 1);

      await admin.saveSchedule(weekly);

      expect(fake.locationModel.docs).toHaveLength(1);
      expect(fake.locationModel.docs[0]).toMatchObject({
        id: 'principal',
        weekly,
      });
    });
  });

  describe('savePublicAvailability', () => {
    it('stores the settings next to the schedule without touching it', async () => {
      const saved = await admin.savePublicAvailability({
        enabled: true,
        days: 10,
        serviceIds: ['servicio-basico'],
      });

      expect(saved).toEqual({
        enabled: true,
        days: 10,
        serviceIds: ['servicio-basico'],
      });
      expect(fake.settingsModel.docs[0].publicAvailability).toEqual(saved);
      expect(fake.settingsModel.docs[0].weekly).toEqual(SCHEDULE.weekly);
    });

    it('rejects a service id that does not exist, saving nothing', async () => {
      await expect(
        admin.savePublicAvailability({
          enabled: true,
          days: 7,
          serviceIds: ['servicio-basico', 'nope'],
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Alguno de los servicios publicados no existe.',
        ),
      );
      expect(fake.settingsModel.docs[0].publicAvailability).toBeUndefined();
    });

    it('accepts null (all services) without looking services up', async () => {
      await expect(
        admin.savePublicAvailability({
          enabled: true,
          days: 7,
          serviceIds: null,
        }),
      ).resolves.toEqual({ enabled: true, days: 7, serviceIds: null });
    });
  });
});
