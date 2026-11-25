import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { DomainError } from '../../../shared/domain/domain-error';
import { err, ok } from '../../../shared/domain/result';
import { SCHEDULE } from '../../catalog.config';
import { Location } from '../../domain/location';
import { LocationNotFound } from '../../domain/location.errors';
import { LocationsAdminController } from './locations-admin.controller';
import { PublicAvailabilityAdminController } from './public-availability-admin.controller';

const centro: Location = {
  id: 'centro',
  name: 'Centro',
  address: 'Av. 1',
  active: true,
  weekly: SCHEDULE.weekly,
  slotIntervalMinutes: 30,
  startIntervalMinutes: 30,
  createdAt: new Date(0),
};
const ADMIN_CENTRO = {
  id: 'centro',
  name: 'Centro',
  address: 'Av. 1',
  schedule: {
    weekly: SCHEDULE.weekly,
    slotIntervalMinutes: 30,
    startIntervalMinutes: 30,
  },
  active: true,
};

describe('LocationsAdminController', () => {
  const create = { execute: jest.fn() };
  const update = { execute: jest.fn() };
  let controller: LocationsAdminController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new LocationsAdminController(create as never, update as never);
  });

  it('is protected by AdminKeyGuard and mounted under /admin/locations', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, LocationsAdminController),
    ).toEqual([AdminKeyGuard]);
    expect(Reflect.getMetadata('path', LocationsAdminController)).toBe(
      'admin/locations',
    );
  });

  it('creates from the validated body and answers the admin view', async () => {
    create.execute.mockResolvedValue(ok(centro));

    await expect(
      controller.create({ name: ' Centro ', address: ' Av. 1 ', id: 'x' }),
    ).resolves.toEqual(ADMIN_CENTRO);
    expect(create.execute).toHaveBeenCalledWith({
      input: { name: 'Centro', address: 'Av. 1' },
    });
  });

  it('answers a 400 for an invalid create body without touching the use case', async () => {
    await expect(controller.create({})).rejects.toBeInstanceOf(DomainError);
    expect(create.execute).not.toHaveBeenCalled();
  });

  it('edits with only the provided fields', async () => {
    update.execute.mockResolvedValue(ok(centro));

    await expect(
      controller.update('centro', { active: false, foo: 1 }),
    ).resolves.toEqual(ADMIN_CENTRO);
    expect(update.execute).toHaveBeenCalledWith({
      id: 'centro',
      patch: { active: false },
    });
  });

  it('validates the body before looking the location up (400 before 404)', async () => {
    await expect(controller.update('nope', {})).rejects.toMatchObject({
      kind: 'validation',
    });
    expect(update.execute).not.toHaveBeenCalled();
  });

  it('turns a business failure into a thrown domain error', async () => {
    update.execute.mockResolvedValue(err(new LocationNotFound('nope')));
    await expect(
      controller.update('nope', { name: 'X' }),
    ).rejects.toBeInstanceOf(LocationNotFound);
  });
});

describe('PublicAvailabilityAdminController', () => {
  const save = { execute: jest.fn() };
  let controller: PublicAvailabilityAdminController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new PublicAvailabilityAdminController(save as never);
  });

  it('is protected by AdminKeyGuard and mounted under /admin/public-availability', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PublicAvailabilityAdminController),
    ).toEqual([AdminKeyGuard]);
    expect(Reflect.getMetadata('path', PublicAvailabilityAdminController)).toBe(
      'admin/public-availability',
    );
  });

  it('saves the validated settings and answers them under publicAvailability', async () => {
    const settings = { enabled: true, days: 5, serviceIds: ['corte'] };
    save.execute.mockResolvedValue(ok(settings));

    await expect(controller.save(settings)).resolves.toEqual({
      publicAvailability: settings,
    });
    expect(save.execute).toHaveBeenCalledWith({ settings });
  });

  it('answers a 400 for invalid settings without touching the use case', async () => {
    await expect(controller.save({})).rejects.toBeInstanceOf(DomainError);
    expect(save.execute).not.toHaveBeenCalled();
  });
});
