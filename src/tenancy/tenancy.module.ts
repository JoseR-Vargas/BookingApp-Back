// ===== MÓDULO DE NEGOCIOS (TENANCY) =====
// The business a request belongs to: its rules, its repository and the scope
// the adapters read. The module is imported by the application module; the
// middleware is registered in `configureApp` (main.ts).

import {
  Injectable,
  MiddlewareConsumer,
  Module,
  NestModule,
  OnModuleInit,
} from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TENANT_SCOPE } from '../shared/application/tenant-context.port';
import { AsyncLocalStorageTenantContext } from '../shared/infrastructure/tenancy/async-local-storage-tenant-context';
import { CLOCK } from '../shared/application/clock.port';
import { SystemClock } from '../shared/infrastructure/system.clock';
import {
  TENANT_READER,
  TENANT_WRITER,
} from './application/ports/tenant.repository';
import { TenantService } from './application/tenant.service';
import { DefaultTenantScope } from './infrastructure/default-tenant.scope';
import { TenantMiddleware } from './infrastructure/http/tenant.middleware';
import { TenantMigration } from './infrastructure/migration/tenant-migration';
import {
  TenantRecord,
  TenantSchema,
} from './infrastructure/persistence/mongo/tenant.entity';
import { MongoTenantRepository } from './infrastructure/persistence/mongo/mongo-tenant.repository';

/**
 * The businesses come first: the migration creates the default one and stamps
 * the documents that existed before it. It runs in the tenancy module, which
 * Nest initializes before the modules that seed (spec 18).
 */
@Injectable()
class TenantBootstrap implements OnModuleInit {
  constructor(private readonly migration: TenantMigration) {}

  async onModuleInit(): Promise<void> {
    await this.migration.run();
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TenantRecord.name, schema: TenantSchema },
    ]),
  ],
  providers: [
    { provide: TENANT_READER, useClass: MongoTenantRepository },
    { provide: TENANT_WRITER, useClass: MongoTenantRepository },
    { provide: TENANT_SCOPE, useClass: AsyncLocalStorageTenantContext },
    { provide: CLOCK, useClass: SystemClock },
    TenantService,
    TenantMiddleware,
    DefaultTenantScope,
    TenantMigration,
    TenantBootstrap,
  ],
  exports: [
    TENANT_READER,
    TENANT_WRITER,
    TENANT_SCOPE,
    TenantService,
    TenantMiddleware,
    DefaultTenantScope,
    TenantMigration,
  ],
})
export class TenancyModule implements NestModule {
  /**
   * Every request belongs to a business (spec 18): the header names it and the
   * rest of the request runs inside its scope.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
