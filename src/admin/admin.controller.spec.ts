import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminKeyGuard } from '../auth/admin-key.guard';
import { AdminController } from './admin.controller';

describe('AdminController', () => {
  const catalog = {
    getAdminCatalog: jest.fn(),
  };
  let controller: AdminController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new AdminController(catalog as never);
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
});
