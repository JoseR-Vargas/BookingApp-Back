import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { DomainError } from '../../../shared/domain/domain-error';
import { err, ok } from '../../../shared/domain/result';
import { WeeklySchedule } from '../../../shared/domain/schedule/schedule';
import { NoActiveLocationError } from '../../domain/catalog.errors';
import { Location } from '../../domain/location';
import { LocationNotFound } from '../../domain/location.errors';
import { ScheduleAdminController } from './schedule-admin.controller';

const weekly = {
  0: { closed: true },
  1: { closed: false, open: '09:00', close: '18:00' },
  2: { closed: false, open: '09:00', close: '18:00' },
  3: { closed: false, open: '09:00', close: '18:00' },
  4: { closed: false, open: '09:00', close: '18:00' },
  5: { closed: false, open: '09:00', close: '18:00' },
  6: { closed: true },
};

const stored = (extra: Partial<Location> = {}): Location => ({
  id: 'principal',
  name: 'Principal',
  address: '',
  active: true,
  weekly: weekly as Location['weekly'],
  slotIntervalMinutes: 30,
  startIntervalMinutes: 30,
  createdAt: new Date(0),
  ...extra,
});

/** Carried over from the former AdminController spec: same assertions, new setup. */
describe('ScheduleAdminController', () => {
  const save = { execute: jest.fn() };
  const resolveDefault = { execute: jest.fn() };
  const impact = { countAffected: jest.fn() };
  let controller: ScheduleAdminController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ScheduleAdminController(
      save as never,
      resolveDefault as never,
      impact as never,
    );
  });

  it('is protected by AdminKeyGuard and mounted under /admin', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ScheduleAdminController),
    ).toEqual([AdminKeyGuard]);
    expect(Reflect.getMetadata('path', ScheduleAdminController)).toBe('admin');
  });

  describe('PUT /admin/schedule', () => {
    const saved: WeeklySchedule = {
      weekly: weekly as WeeklySchedule['weekly'],
      slotIntervalMinutes: 30,
      startIntervalMinutes: 30,
    };

    it('saves, then reports the affected bookings without blocking the save', async () => {
      save.execute.mockResolvedValue(ok(stored()));
      impact.countAffected.mockResolvedValue(4);
      resolveDefault.execute.mockResolvedValue(ok(stored()));

      const result = await controller.saveSchedule({ weekly });

      expect(save.execute).toHaveBeenCalledWith({
        weekly,
        startIntervalMinutes: undefined,
      });
      expect(impact.countAffected).toHaveBeenCalledWith(
        saved,
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        { locationId: 'principal', defaultLocationId: 'principal' },
      );
      expect(result).toEqual({ schedule: saved, affectedBookings: 4 });
    });

    it('passes a given start interval to the save', async () => {
      save.execute.mockResolvedValue(ok(stored({ startIntervalMinutes: 180 })));
      impact.countAffected.mockResolvedValue(0);
      resolveDefault.execute.mockResolvedValue(ok(stored()));

      await controller.saveSchedule({ weekly, startIntervalMinutes: 180 });

      expect(save.execute).toHaveBeenCalledWith({
        weekly,
        startIntervalMinutes: 180,
      });
    });

    it('answers 400 for an invalid start interval and saves nothing', async () => {
      await expect(
        controller.saveSchedule({ weekly, startIntervalMinutes: 45 }),
      ).rejects.toMatchObject({
        kind: 'validation',
        message:
          'El intervalo entre turnos debe ser un múltiplo de 30 minutos, entre 30 y 480.',
      });
      expect(save.execute).not.toHaveBeenCalled();
    });

    it('answers 400 for an invalid schedule and saves nothing', async () => {
      const invalid = {
        weekly: {
          ...weekly,
          1: { closed: false, open: '18:00', close: '09:00' },
        },
      };

      await expect(controller.saveSchedule(invalid)).rejects.toBeInstanceOf(
        DomainError,
      );
      expect(save.execute).not.toHaveBeenCalled();
      expect(impact.countAffected).not.toHaveBeenCalled();
    });

    it('turns a business failure of the save into a thrown domain error', async () => {
      save.execute.mockResolvedValue(err(new NoActiveLocationError()));

      await expect(controller.saveSchedule({ weekly })).rejects.toBeInstanceOf(
        NoActiveLocationError,
      );
      expect(impact.countAffected).not.toHaveBeenCalled();
    });
  });

  describe('PUT /admin/locations/:id/schedule', () => {
    it('saves that location, then counts only its bookings against the default', async () => {
      save.execute.mockResolvedValue(
        ok(stored({ id: 'centro', startIntervalMinutes: 60 })),
      );
      impact.countAffected.mockResolvedValue(2);
      resolveDefault.execute.mockResolvedValue(ok(stored()));

      const result = await controller.saveLocationScheduleOf('centro', {
        weekly,
        startIntervalMinutes: 60,
      });

      expect(save.execute).toHaveBeenCalledWith({
        locationId: 'centro',
        weekly,
        startIntervalMinutes: 60,
      });
      expect(impact.countAffected).toHaveBeenCalledWith(
        { weekly, slotIntervalMinutes: 30, startIntervalMinutes: 60 },
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        { locationId: 'centro', defaultLocationId: 'principal' },
      );
      expect(result.affectedBookings).toBe(2);
    });

    it('answers a not-found for an unknown location without counting', async () => {
      save.execute.mockResolvedValue(err(new LocationNotFound('nope')));

      await expect(
        controller.saveLocationScheduleOf('nope', { weekly }),
      ).rejects.toBeInstanceOf(LocationNotFound);
      expect(impact.countAffected).not.toHaveBeenCalled();
    });

    it('answers 400 for an invalid body and saves nothing', async () => {
      await expect(
        controller.saveLocationScheduleOf('centro', {}),
      ).rejects.toMatchObject({ kind: 'validation' });
      expect(save.execute).not.toHaveBeenCalled();
    });
  });
});
