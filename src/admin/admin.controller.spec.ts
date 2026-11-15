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
  const catalog = { getAdminCatalog: jest.fn() };
  const admin = {
    createProfessional: jest.fn(),
    updateProfessional: jest.fn(),
    createService: jest.fn(),
    updateService: jest.fn(),
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

  describe('professionals', () => {
    it('creates from the validated body', async () => {
      admin.createProfessional.mockResolvedValue({ id: 'ana' });

      await expect(
        controller.createProfessional({ name: ' Ana ', id: 'x' }),
      ).resolves.toEqual({ id: 'ana' });
      expect(admin.createProfessional).toHaveBeenCalledWith({
        name: 'Ana',
        specialty: '',
        experience: '',
        active: true,
      });
    });

    it('answers 400 for an invalid create body without touching the service', async () => {
      await expect(controller.createProfessional({})).rejects.toThrow(
        BadRequestException,
      );
      expect(admin.createProfessional).not.toHaveBeenCalled();
    });

    it('updates only the editable fields', async () => {
      admin.updateProfessional.mockResolvedValue({ id: 'ana' });

      await controller.updateProfessional('ana', { active: false, rating: 1 });

      expect(admin.updateProfessional).toHaveBeenCalledWith('ana', {
        active: false,
      });
    });

    it('answers 400 for an invalid update body', async () => {
      await expect(
        controller.updateProfessional('ana', { name: '' }),
      ).rejects.toThrow(BadRequestException);
      expect(admin.updateProfessional).not.toHaveBeenCalled();
    });

    it('DELETE is a soft delete that returns the updated entity', async () => {
      const entity = { id: 'ana', active: false };
      admin.updateProfessional.mockResolvedValue(entity);

      await expect(controller.deleteProfessional('ana')).resolves.toBe(entity);
      expect(admin.updateProfessional).toHaveBeenCalledWith('ana', {
        active: false,
      });
    });
  });

  describe('services', () => {
    const body = {
      name: 'Corte',
      price: 100,
      duration: 30,
      professionals: ['alex-garcia'],
    };

    it('creates from the validated body', async () => {
      admin.createService.mockResolvedValue({ id: 'corte' });

      await controller.createService(body);

      expect(admin.createService).toHaveBeenCalledWith({
        ...body,
        description: '',
        active: true,
      });
    });

    it.each([
      [{ ...body, price: -1 }],
      [{ ...body, duration: 4 }],
      [{ ...body, duration: 481 }],
      [{ ...body, professionals: [] }],
    ])('answers 400 for %j', async (invalid) => {
      await expect(controller.createService(invalid)).rejects.toThrow(
        BadRequestException,
      );
      expect(admin.createService).not.toHaveBeenCalled();
    });

    it('updates only the editable fields', async () => {
      admin.updateService.mockResolvedValue({ id: 'corte' });

      await controller.updateService('corte', { price: 90, icon: 'x' });

      expect(admin.updateService).toHaveBeenCalledWith('corte', { price: 90 });
    });

    it('DELETE is a soft delete that returns the updated entity', async () => {
      const entity = { id: 'corte', active: false };
      admin.updateService.mockResolvedValue(entity);

      await expect(controller.deleteService('corte')).resolves.toBe(entity);
      expect(admin.updateService).toHaveBeenCalledWith('corte', {
        active: false,
      });
    });
  });

  describe('PUT /admin/schedule', () => {
    const saved: WeeklySchedule = {
      weekly: weekly as WeeklySchedule['weekly'],
      slotIntervalMinutes: 30,
    };

    it('saves, then reports the affected bookings without blocking the save', async () => {
      admin.saveSchedule.mockResolvedValue(saved);
      impact.countAffected.mockResolvedValue(4);

      const result = await controller.saveSchedule({ weekly });

      expect(admin.saveSchedule).toHaveBeenCalledWith(weekly);
      expect(impact.countAffected).toHaveBeenCalledWith(
        saved,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
      expect(result).toEqual({ schedule: saved, affectedBookings: 4 });
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
