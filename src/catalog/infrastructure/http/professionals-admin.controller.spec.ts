import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { DomainError } from '../../../shared/domain/domain-error';
import { err, ok } from '../../../shared/domain/result';
import { ProfessionalNotFoundError } from '../../domain/catalog.errors';
import { Professional } from '../../domain/professional';
import { ProfessionalPhotosAdminController } from './professional-photos-admin.controller';
import { ProfessionalsAdminController } from './professionals-admin.controller';
import { currentBusinessDate } from '../../../admin/schedule-impact';

const professional: Professional = {
  id: 'ana',
  name: 'Ana',
  specialty: '',
  experience: '',
  rating: 5,
  avatar: 'fas fa-user',
  active: true,
  photo: null,
  locationIds: ['principal'],
};
const view = { professional, locationIds: ['principal'] };
const ADMIN_ANA = {
  id: 'ana',
  name: 'Ana',
  specialty: '',
  experience: '',
  rating: 5,
  avatar: 'fas fa-user',
  active: true,
  photoUrl: null,
  locations: ['principal'],
};

describe('ProfessionalsAdminController', () => {
  const create = { execute: jest.fn() };
  const update = { execute: jest.fn() };
  const deactivate = { execute: jest.fn() };
  const remove = { execute: jest.fn() };
  let controller: ProfessionalsAdminController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ProfessionalsAdminController(
      create as never,
      update as never,
      deactivate as never,
      remove as never,
    );
  });

  it('is protected by AdminKeyGuard and mounted under /admin/professionals', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ProfessionalsAdminController),
    ).toEqual([AdminKeyGuard]);
    expect(Reflect.getMetadata('path', ProfessionalsAdminController)).toBe(
      'admin/professionals',
    );
  });

  it('creates from the validated body', async () => {
    create.execute.mockResolvedValue(ok(view));

    await expect(
      controller.create({ name: ' Ana ', id: 'x' }),
    ).resolves.toEqual(ADMIN_ANA);
    expect(create.execute).toHaveBeenCalledWith({
      input: { name: 'Ana', specialty: '', experience: '', active: true },
      photo: null,
    });
  });

  it('answers a 400 for an invalid create body without touching the use case', async () => {
    await expect(controller.create({})).rejects.toBeInstanceOf(DomainError);
    expect(create.execute).not.toHaveBeenCalled();
  });

  it('turns a business failure of the use case into a thrown domain error', async () => {
    create.execute.mockResolvedValue(err(new ProfessionalNotFoundError('x')));
    await expect(controller.create({ name: 'Ana' })).rejects.toBeInstanceOf(
      ProfessionalNotFoundError,
    );
  });

  it('updates only the editable fields', async () => {
    update.execute.mockResolvedValue(ok(view));

    await controller.update('ana', { active: false, rating: 1 });

    expect(update.execute).toHaveBeenCalledWith({
      id: 'ana',
      patch: { active: false },
    });
  });

  it('answers a 400 for an invalid update body', async () => {
    await expect(controller.update('ana', { name: '' })).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(update.execute).not.toHaveBeenCalled();
  });

  it('DELETE is a soft delete that returns the updated professional', async () => {
    deactivate.execute.mockResolvedValue(
      ok({ ...view, professional: { ...professional, active: false } }),
    );

    await expect(controller.deactivate('ana')).resolves.toEqual({
      ...ADMIN_ANA,
      active: false,
    });
    expect(deactivate.execute).toHaveBeenCalledWith('ana');
  });

  it('DELETE .../permanent deletes with today in the business timezone', async () => {
    remove.execute.mockResolvedValue(ok({ id: 'ana', deleted: true }));

    await expect(controller.deletePermanently('ana')).resolves.toEqual({
      id: 'ana',
      deleted: true,
    });
    expect(remove.execute).toHaveBeenCalledWith({
      id: 'ana',
      today: currentBusinessDate(),
    });
  });
});

describe('ProfessionalPhotosAdminController', () => {
  const set = { execute: jest.fn() };
  const remove = { execute: jest.fn() };
  let controller: ProfessionalPhotosAdminController;
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16, 7),
  ]);

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ProfessionalPhotosAdminController(
      set as never,
      remove as never,
    );
  });

  it('is protected by AdminKeyGuard and mounted under /admin/professionals', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ProfessionalPhotosAdminController),
    ).toEqual([AdminKeyGuard]);
    expect(Reflect.getMetadata('path', ProfessionalPhotosAdminController)).toBe(
      'admin/professionals',
    );
  });

  it('sets the decoded photo', async () => {
    set.execute.mockResolvedValue(ok(view));

    await expect(
      controller.setPhoto('ana', {
        dataUrl: `data:image/png;base64,${PNG.toString('base64')}`,
      }),
    ).resolves.toEqual(ADMIN_ANA);
    expect(set.execute).toHaveBeenCalledWith({
      id: 'ana',
      photo: { mimeType: 'image/png', data: PNG },
    });
  });

  it('answers a 400 for an invalid photo without touching the use case', async () => {
    await expect(controller.setPhoto('ana', {})).rejects.toThrow(
      'La foto debe ser PNG, JPG o WebP de hasta 200 KB.',
    );
    expect(set.execute).not.toHaveBeenCalled();
  });

  it('removes the photo', async () => {
    remove.execute.mockResolvedValue(ok(view));
    await expect(controller.removePhoto('ana')).resolves.toEqual(ADMIN_ANA);
    expect(remove.execute).toHaveBeenCalledWith('ana');
  });
});
