import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../auth/admin-key.guard';
import { AdminCatalog, CatalogService } from '../catalog/catalog.service';

/**
 * Business configuration read behind the admin key: the admin catalog. The
 * write routes live in the catalog module (professionals, services, photos,
 * locations, schedules and the public availability settings).
 */
@Controller('admin')
@UseGuards(AdminKeyGuard)
export class AdminController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('catalog')
  getCatalog(): Promise<AdminCatalog> {
    return this.catalog.getAdminCatalog();
  }
}
