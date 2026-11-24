import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Booking, BookingSchema } from '../bookings/schemas/booking.schema';
import { CLOCK } from '../shared/application/clock.port';
import { SystemClock } from '../shared/infrastructure/system.clock';
import { BOOKING_ACTIVITY } from './application/ports/booking-activity.port';
import { LOCATION_DIRECTORY } from './application/ports/location-directory.port';
import { PROFESSIONAL_PHOTO_STORE } from './application/ports/professional-photo.store';
import { PROFESSIONAL_READER } from './application/ports/professional.reader';
import { PROFESSIONAL_WRITER } from './application/ports/professional.writer';
import { SERVICE_READER } from './application/ports/service.reader';
import { SERVICE_WRITER } from './application/ports/service.writer';
import { GetPublicCatalogUseCase } from './application/use-cases/get-public-catalog.use-case';
import { CreateProfessionalUseCase } from './application/use-cases/professionals/create-professional.use-case';
import { DeactivateProfessionalUseCase } from './application/use-cases/professionals/deactivate-professional.use-case';
import { DeleteProfessionalPermanentlyUseCase } from './application/use-cases/professionals/delete-professional-permanently.use-case';
import { FindActiveProfessionalUseCase } from './application/use-cases/professionals/find-active-professional.use-case';
import { GetProfessionalPhotoUseCase } from './application/use-cases/professionals/get-professional-photo.use-case';
import { ListProfessionalsForServiceUseCase } from './application/use-cases/professionals/list-professionals-for-service.use-case';
import { ListProfessionalsUseCase } from './application/use-cases/professionals/list-professionals.use-case';
import { ProfessionalWorksAtLocationUseCase } from './application/use-cases/professionals/professional-works-at-location.use-case';
import { RemoveProfessionalPhotoUseCase } from './application/use-cases/professionals/remove-professional-photo.use-case';
import { SetProfessionalPhotoUseCase } from './application/use-cases/professionals/set-professional-photo.use-case';
import { UpdateProfessionalUseCase } from './application/use-cases/professionals/update-professional.use-case';
import { ResolveServiceSelectionUseCase } from './application/use-cases/resolve-service-selection.use-case';
import { CreateServiceUseCase } from './application/use-cases/services/create-service.use-case';
import { DeactivateServiceUseCase } from './application/use-cases/services/deactivate-service.use-case';
import { DeleteServicePermanentlyUseCase } from './application/use-cases/services/delete-service-permanently.use-case';
import { FindActiveServiceUseCase } from './application/use-cases/services/find-active-service.use-case';
import { ListServicesUseCase } from './application/use-cases/services/list-services.use-case';
import { UpdateServiceUseCase } from './application/use-cases/services/update-service.use-case';
import { CatalogAdminService } from './catalog-admin.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { MongoBookingActivityAdapter } from './infrastructure/bookings/mongo-booking-activity.adapter';
import { CatalogPhotoController } from './infrastructure/http/catalog-photo.controller';
import { ProfessionalPhotosAdminController } from './infrastructure/http/professional-photos-admin.controller';
import { ProfessionalsAdminController } from './infrastructure/http/professionals-admin.controller';
import { ServicesAdminController } from './infrastructure/http/services-admin.controller';
import { MongoLocationDirectoryAdapter } from './infrastructure/locations/mongo-location-directory.adapter';
import { CatalogSeeder } from './infrastructure/persistence/mongo/catalog.seeder';
import { MongoProfessionalRepository } from './infrastructure/persistence/mongo/mongo-professional.repository';
import { MongoServiceRepository } from './infrastructure/persistence/mongo/mongo-service.repository';
import {
  ProfessionalRecord,
  ProfessionalSchema,
} from './infrastructure/persistence/mongo/professional.entity';
import {
  ServiceRecord,
  ServiceSchema,
} from './infrastructure/persistence/mongo/service.entity';
import {
  BusinessSettingsRecord,
  BusinessSettingsSchema,
} from './schemas/business-settings.schema';
import { LocationRecord, LocationSchema } from './schemas/location.schema';

/**
 * Composition root of the catalog: the only place where ports are bound to
 * adapters. Swapping the database means new adapters and changing these lines.
 * `CatalogService` and `CatalogAdminService` are the temporary facades the
 * modules that are not migrated yet still call.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProfessionalRecord.name, schema: ProfessionalSchema },
      { name: ServiceRecord.name, schema: ServiceSchema },
      { name: BusinessSettingsRecord.name, schema: BusinessSettingsSchema },
      { name: LocationRecord.name, schema: LocationSchema },
      // Read-only, for the id-reuse and delete guards (BookingActivity).
      { name: Booking.name, schema: BookingSchema },
    ]),
  ],
  controllers: [
    CatalogController,
    CatalogPhotoController,
    ProfessionalsAdminController,
    ProfessionalPhotosAdminController,
    ServicesAdminController,
  ],
  providers: [
    MongoProfessionalRepository,
    MongoServiceRepository,
    { provide: PROFESSIONAL_READER, useExisting: MongoProfessionalRepository },
    { provide: PROFESSIONAL_WRITER, useExisting: MongoProfessionalRepository },
    {
      provide: PROFESSIONAL_PHOTO_STORE,
      useExisting: MongoProfessionalRepository,
    },
    { provide: SERVICE_READER, useExisting: MongoServiceRepository },
    { provide: SERVICE_WRITER, useExisting: MongoServiceRepository },
    // Temporary ports: answered from other modules' collections until those migrate.
    { provide: BOOKING_ACTIVITY, useClass: MongoBookingActivityAdapter },
    { provide: LOCATION_DIRECTORY, useClass: MongoLocationDirectoryAdapter },
    { provide: CLOCK, useClass: SystemClock },
    ListProfessionalsUseCase,
    CreateProfessionalUseCase,
    UpdateProfessionalUseCase,
    DeactivateProfessionalUseCase,
    SetProfessionalPhotoUseCase,
    RemoveProfessionalPhotoUseCase,
    GetProfessionalPhotoUseCase,
    DeleteProfessionalPermanentlyUseCase,
    FindActiveProfessionalUseCase,
    ListProfessionalsForServiceUseCase,
    ProfessionalWorksAtLocationUseCase,
    ListServicesUseCase,
    CreateServiceUseCase,
    UpdateServiceUseCase,
    DeactivateServiceUseCase,
    DeleteServicePermanentlyUseCase,
    FindActiveServiceUseCase,
    ResolveServiceSelectionUseCase,
    GetPublicCatalogUseCase,
    CatalogSeeder,
    CatalogService,
    CatalogAdminService,
  ],
  exports: [CatalogService, CatalogAdminService],
})
export class CatalogModule {}
