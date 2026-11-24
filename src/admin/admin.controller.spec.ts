import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminKeyGuard } from '../auth/admin-key.guard';
import { WeeklySchedule } from '../catalog/catalog.config';
import { AdminController } from './admin.controller';

const weekly = {
  0: { closed: true },
  1: { closed: false, open: '09:00', close: '18:00' },
  2: { closed: false, open: '09:00', close: '18:00' },
  3: { closed: false, open: '09:00', close: '18:00' },
  4: { closed: false, open: '09:00', close: '18:00' },
  5: { closed: false, open: '09:00', close: '18:00' },
  6: { closed: true },
};

describe('AdminController', () => {
  const catalog = {
    getAdminCatalog: jest.fn(),
    getDefaultLocationId: jest.fn(),
  };
  const admin = {
    saveSchedule: jest.fn(),
  };
  const impact = { countAffected: jest.fn() };
  let controller: AdminController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new AdminController(
      catalog as never,
      admin as never,
      impact as never,
    );
  });

  it('is protected by AdminKeyGuard and mounted under /admin', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminController)).toEqual([
      AdminKeyGuard,
    ]);
    expect(Reflect.getMetadata('path', AdminController)).toBe('admin');
  });

  it('GET /admin/catalog returns the admin catalog', async () => {
    const full = { professionals: [], services: [], schedule: {} };
    catalog.getAdminCatalog.mockResolvedValue(full);

    await expect(controller.getCatalog()).resolves.toBe(full);
  });

  describe('PUT /admin/schedule', () => {
    const saved: WeeklySchedule = {
      weekly: weekly as WeeklySchedule['weekly'],
      slotIntervalMinutes: 30,
      startIntervalMinutes: 30,
    };

    it('saves, then reports the affected bookings without blocking the save', async () => {
      admin.saveSchedule.mockResolvedValue(saved);
      impact.countAffected.mockResolvedValue(4);
      catalog.getDefaultLocationId.mockResolvedValue('principal');

      const result = await controller.saveSchedule({ weekly });

      expect(admin.saveSchedule).toHaveBeenCalledWith(weekly, undefined);
      expect(impact.countAffected).toHaveBeenCalledWith(
        saved,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        { locationId: 'principal', defaultLocationId: 'principal' },
      );
      expect(result).toEqual({ schedule: saved, affectedBookings: 4 });
    });

    it('passes a given start interval to the save', async () => {
      admin.saveSchedule.mockResolvedValue({
        ...saved,
        startIntervalMinutes: 180,
      });
      impact.countAffected.mockResolvedValue(0);

      await controller.saveSchedule({ weekly, startIntervalMinutes: 180 });

      expect(admin.saveSchedule).toHaveBeenCalledWith(weekly, 180);
    });

    it('answers 400 for an invalid start interval and saves nothing', async () => {
      await expect(
        controller.saveSchedule({ weekly, startIntervalMinutes: 45 }),
      ).rejects.toThrow(BadRequestException);
      expect(admin.saveSchedule).not.toHaveBeenCalled();
    });

    it('answers 400 for an invalid schedule and saves nothing', async () => {
      const invalid = {
        weekly: {
          ...weekly,
          1: { closed: false, open: '18:00', close: '09:00' },
        },
      };

      await expect(controller.saveSchedule(invalid)).rejects.toThrow(
        BadRequestException,
      );
      expect(admin.saveSchedule).not.toHaveBeenCalled();
      expect(impact.countAffected).not.toHaveBeenCalled();
    });
  });
});
