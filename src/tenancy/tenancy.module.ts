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
  RequestMethod,
} from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TENANT_CONTEXT,
  TENANT_SCOPE,
} from '../shared/application/tenant-context.port';
import { AsyncLocalStorageTenantContext } from '../shared/infrastructure/tenancy/async-local-storage-tenant-context';
import { CLOCK } from '../shared/application/clock.port';
import { SystemClock } from '../shared/infrastructure/system.clock';
import {
  TENANT_READER,
  TENANT_WRITER,
} from './application/ports/tenant.repository';
import { TENANT_DIRECTORY } from './application/ports/tenant-directory.port';
import {
  TENANT_REMINDERS_READER,
  TENANT_REMINDERS_WRITER,
} from './application/ports/tenant-reminders.port';
import { TENANT_BOOKING_COUNTER } from './application/ports/tenant-booking-counter.port';
import { TENANT_ERASER } from './application/ports/tenant-eraser.port';
import { TENANT_STORAGE_METER } from './application/ports/tenant-storage-meter.port';
import { TENANT_STORAGE_STORE } from './application/ports/tenant-storage-store.port';
import { GetStorageStatusUseCase } from './application/use-cases/get-storage-status.use-case';
import { STORAGE_GATE } from '../shared/application/storage-gate.port';
import { TenancyStorageGate } from './infrastructure/tenancy-storage-gate';
import { MongoTenantStorageMeter } from './infrastructure/persistence/mongo/mongo-tenant-storage-meter';
import { GetTrialStatusUseCase } from './application/use-cases/get-trial-status.use-case';
import { TenantService } from './application/tenant.service';
import { DefaultTenantScope } from './infrastructure/default-tenant.scope';
import { TenantMiddleware } from './infrastructure/http/tenant.middleware';
import { TenantMigration } from './infrastructure/migration/tenant-migration';
import {
  TenantRecord,
  TenantSchema,
} from './infrastructure/persistence/mongo/tenant.entity';
import { MongoTenantBookingCounter } from './infrastructure/persistence/mongo/mongo-tenant-booking-counter';
import { MongoTenantEraser } from './infrastructure/persistence/mongo/mongo-tenant-eraser';
import { MongoTenantRepository } from './infrastructure/persistence/mongo/mongo-tenant.repository';
import { MongoTenantDirectory } from './infrastructure/persistence/mongo/mongo-tenant-directory';
import { MongoTenantReminders } from './infrastructure/persistence/mongo/mongo-tenant-reminders';

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
    // The reminders of the business (spec 24) and the list of the businesses
    // the scheduler of the reminders walks.
    { provide: TENANT_REMINDERS_READER, useExisting: MongoTenantReminders },
    { provide: TENANT_REMINDERS_WRITER, useExisting: MongoTenantReminders },
    { provide: TENANT_DIRECTORY, useClass: MongoTenantDirectory },
    MongoTenantReminders,
    MongoTenantDirectory,
    { provide: TENANT_ERASER, useClass: MongoTenantEraser },
    { provide: TENANT_STORAGE_STORE, useClass: MongoTenantRepository },
    { provide: TENANT_STORAGE_METER, useClass: MongoTenantStorageMeter },
    { provide: STORAGE_GATE, useClass: TenancyStorageGate },
    { provide: TENANT_BOOKING_COUNTER, useClass: MongoTenantBookingCounter },
    { provide: TENANT_SCOPE, useClass: AsyncLocalStorageTenantContext },
    { provide: TENANT_CONTEXT, useExisting: TENANT_SCOPE },
    { provide: CLOCK, useClass: SystemClock },
    TenantService,
    GetTrialStatusUseCase,
    GetStorageStatusUseCase,
    TenantMiddleware,
    DefaultTenantScope,
    TenantMigration,
    TenantBootstrap,
  ],
  exports: [
    TENANT_READER,
    TENANT_WRITER,
    TENANT_DIRECTORY,
    TENANT_REMINDERS_READER,
    TENANT_REMINDERS_WRITER,
    TENANT_SCOPE,
    TENANT_CONTEXT,
    TENANT_ERASER,
    TenantService,
    GetTrialStatusUseCase,
    GetStorageStatusUseCase,
    STORAGE_GATE,
    TenantMiddleware,
    DefaultTenantScope,
    TenantMigration,
  ],
})
export class TenancyModule implements NestModule {
  /**
   * Every request belongs to a business (spec 18): the header names it and the
   * rest of the request runs inside its scope. Two routes are exempt: `POST
   * /api/signup` (spec 21: it creates the business and opens the scope itself)
   * and `POST /api/webhooks/payments` (spec 23: the event names the business).
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      // The signup creates its business: it has none until then (spec 21).
      .exclude(
        { path: 'signup', method: RequestMethod.POST },
        // The gateway's webhook has no business header: the event names it (spec 23).
        { path: 'webhooks/payments', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}
