import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { DomainError } from '../../../shared/domain/domain-error';
import { ok } from '../../../shared/domain/result';
import { currentBusinessDate } from '../../../admin/schedule-impact';
import { Service } from '../../domain/service';
import { ServicesAdminController } from './services-admin.controller';

const service: Service = {
  id: 'corte',
  name: 'Corte',
  description: '',
  price: 100,
  duration: 30,
  professionals: ['alex-garcia'],
  icon: 'fas fa-star',
  active: true,
};

describe('ServicesAdminController', () => {
  const create = { execute: jest.fn() };
  const update = { execute: jest.fn() };
  const deactivate = { execute: jest.fn() };
  const remove = { execute: jest.fn() };
  let controller: ServicesAdminController;
  const body = {
    name: 'Corte',
    price: 100,
    duration: 30,
    professionals: ['alex-garcia'],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ServicesAdminController(
      create as never,
      update as never,
      deactivate as never,
      remove as never,
    );
  });

  it('is protected by AdminKeyGuard and mounted under /admin/services', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ServicesAdminController),
    ).toEqual([AdminKeyGuard]);
    expect(Reflect.getMetadata('path', ServicesAdminController)).toBe(
      'admin/services',
    );
  });

  it('creates from the validated body', async () => {
    create.execute.mockResolvedValue(ok(service));

    await expect(controller.create(body)).resolves.toEqual(service);
    expect(create.execute).toHaveBeenCalledWith({
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
  ])('answers a 400 for %j', async (invalid) => {
    await expect(controller.create(invalid)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(create.execute).not.toHaveBeenCalled();
  });

  it('updates only the editable fields', async () => {
    update.execute.mockResolvedValue(ok(service));

    await controller.update('corte', { price: 90, icon: 'x' });

    expect(update.execute).toHaveBeenCalledWith({
      id: 'corte',
      patch: { price: 90 },
    });
  });

  it('DELETE is a soft delete that returns the updated service', async () => {
    deactivate.execute.mockResolvedValue(ok({ ...service, active: false }));

    await expect(controller.deactivate('corte')).resolves.toEqual({
      ...service,
      active: false,
    });
    expect(deactivate.execute).toHaveBeenCalledWith('corte');
  });

  it('DELETE .../permanent deletes with today in the business timezone', async () => {
    remove.execute.mockResolvedValue(ok({ id: 'corte', deleted: true }));

    await expect(controller.deletePermanently('corte')).resolves.toEqual({
      id: 'corte',
      deleted: true,
    });
    expect(remove.execute).toHaveBeenCalledWith({
      id: 'corte',
      today: currentBusinessDate(),
    });
  });
});
