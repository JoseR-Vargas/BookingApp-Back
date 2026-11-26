import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CatalogSeeder } from '../../catalog/infrastructure/persistence/mongo/catalog.seeder';
import { BusinessSeeder } from '../application/ports/business-seeder.port';

/**
 * Seeds a new business with the same `seedBase` that `tenant:create` uses:
 * the "Principal" location and the schedule, no professionals or services.
 * The catalog does not export its seeder, so it is looked up by the module
 * reference (the CLI does the same through the application context).
 */
@Injectable()
export class CatalogBusinessSeeder implements BusinessSeeder {
  constructor(private readonly modules: ModuleRef) {}

  seedBase(): Promise<void> {
    return this.modules.get(CatalogSeeder, { strict: false }).seedBase();
  }
}
