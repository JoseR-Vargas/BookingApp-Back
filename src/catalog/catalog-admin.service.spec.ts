import { BadRequestException } from '@nestjs/common';
import { CatalogAdminService } from './catalog-admin.service';
import { createFakeCatalog } from './catalog.testing';
import { SCHEDULE } from './catalog.config';

describe('CatalogAdminService', () => {
  let fake: ReturnType<typeof createFakeCatalog>;
  let admin: CatalogAdminService;

  beforeEach(async () => {
    fake = createFakeCatalog();
    await fake.catalog.onModuleInit();
    admin = fake.admin;
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
