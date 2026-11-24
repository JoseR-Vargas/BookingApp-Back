import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SCHEDULE } from './catalog.config';
import { createFakeCatalog } from './catalog.testing';
import { LocationNotFoundError } from './locations';
import { ServiceSelectionError } from './service-selection';

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

  describe('locations (spec 12)', () => {
    const weekly = {
      ...SCHEDULE.weekly,
      1: { closed: false as const, open: '10:00', close: '14:00' },
    };

    it('getLocation answers the default or the given active location', async () => {
      await expect(fake.catalog.getLocation()).resolves.toMatchObject({
        id: 'principal',
        name: 'Principal',
      });
      await fake.admin.createLocation({ name: 'Centro', address: '' });
      await expect(fake.catalog.getLocation('centro')).resolves.toMatchObject({
        id: 'centro',
        active: true,
      });
    });

    it.each(['nope', undefined])(
      'getLocation(%s) throws LocationNotFoundError once none matches',
      async (id) => {
        await fake.admin.updateLocation('principal', { name: 'P' });
        fake.locationModel.docs[0].active = false;
        const error = await fake.catalog.getLocation(id).catch((e) => e);
        expect(error).toBeInstanceOf(LocationNotFoundError);
        expect(error).toMatchObject({
          locationId: id ?? 'principal',
          message: `Location "${id ?? 'principal'}" not found`,
        });
      },
    );

    it('getSchedule and getDefaultLocationId throw LocationNotFoundError for an inactive location', async () => {
      await expect(fake.catalog.getDefaultLocationId()).resolves.toBe(
        'principal',
      );
      await fake.admin.createLocation({ name: 'Norte', address: '' });
      await fake.admin.updateLocation('norte', { active: false });
      await expect(fake.catalog.getSchedule('norte')).rejects.toBeInstanceOf(
        LocationNotFoundError,
      );
      await expect(fake.catalog.getSchedule()).resolves.toEqual(SCHEDULE);
    });

    it('getActiveLocations lists the active ones, oldest first', async () => {
      await fake.admin.createLocation({ name: 'Centro', address: '' });
      await fake.admin.createLocation({ name: 'Norte', address: '' });
      await fake.admin.updateLocation('centro', { active: false });
      const active = await fake.catalog.getActiveLocations();
      expect(active.map((l) => l.id)).toEqual(['principal', 'norte']);
    });

    it('getPublicAvailability answers the default, then the saved settings', async () => {
      await expect(fake.catalog.getPublicAvailability()).resolves.toEqual({
        enabled: false,
        days: 7,
        serviceIds: null,
      });
      const settings = {
        enabled: true,
        days: 3,
        serviceIds: ['servicio-basico'],
      };
      await expect(
        fake.admin.savePublicAvailability(settings),
      ).resolves.toEqual(settings);
      await expect(fake.catalog.getPublicAvailability()).resolves.toEqual(
        settings,
      );
    });

    it('saveSchedule acts on the default location and saveLocationSchedule on the given one', async () => {
      await fake.admin.createLocation({ name: 'Centro', address: '' });
      await expect(fake.admin.saveSchedule(weekly, 60)).resolves.toEqual({
        weekly,
        slotIntervalMinutes: 30,
        startIntervalMinutes: 60,
      });
      await expect(
        fake.admin.saveLocationSchedule('centro', weekly),
      ).resolves.toEqual({
        weekly,
        slotIntervalMinutes: 30,
        startIntervalMinutes: 30,
      });
      expect((await fake.catalog.getSchedule()).startIntervalMinutes).toBe(60);
    });

    it('the admin writes raise the Nest exceptions of always', async () => {
      await expect(
        fake.admin.saveLocationSchedule('nope', weekly),
      ).rejects.toEqual(new NotFoundException('Location "nope" not found'));
      await expect(
        fake.admin.updateLocation('nope', { name: 'X' }),
      ).rejects.toEqual(new NotFoundException('Location "nope" not found'));
      await expect(
        fake.admin.updateLocation('principal', { active: false }),
      ).rejects.toEqual(
        new BadRequestException('Debe quedar al menos un local activo.'),
      );
      await expect(
        fake.admin.savePublicAvailability({
          enabled: true,
          days: 7,
          serviceIds: ['nope'],
        }),
      ).rejects.toEqual(
        new BadRequestException(
          'Alguno de los servicios publicados no existe.',
        ),
      );
    });

    it('createLocation answers the admin view with a numbered slug', async () => {
      await fake.admin.createLocation({ name: 'Centro', address: 'Av. 1' });
      await expect(
        fake.admin.createLocation({ name: 'Centro', address: '' }),
      ).resolves.toEqual({
        id: 'centro-2',
        name: 'Centro',
        address: '',
        active: true,
        schedule: SCHEDULE,
      });
    });
  });
});
