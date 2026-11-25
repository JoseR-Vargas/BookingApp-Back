import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleImpactService } from '../admin/schedule-impact';
import { UPCOMING_BOOKINGS_READER } from '../admin/application/ports/upcoming-bookings.reader';
import { CountAffectedBookingsUseCase } from '../admin/application/use-cases/count-affected-bookings.use-case';
import { MongoUpcomingBookingsReader } from '../admin/infrastructure/mongo-upcoming-bookings.reader';
import { CLOCK } from '../shared/application/clock.port';
import { SystemClock } from '../shared/infrastructure/system.clock';
import { BOOKING_ACTIVITY } from './application/ports/booking-activity.port';
import { Booking, BookingSchema } from '../bookings/schemas/booking.schema';
import { LEGACY_SCHEDULE_READER } from './application/ports/legacy-schedule.reader';
import { LOCATION_READER } from './application/ports/location.reader';
import { LOCATION_WRITER } from './application/ports/location.writer';
import { PUBLIC_AVAILABILITY_READER } from './application/ports/public-availability.reader';
import { PUBLIC_AVAILABILITY_WRITER } from './application/ports/public-availability.writer';
import { PROFESSIONAL_PHOTO_STORE } from './application/ports/professional-photo.store';
import { PROFESSIONAL_READER } from './application/ports/professional.reader';
import { PROFESSIONAL_WRITER } from './application/ports/professional.writer';
import { SERVICE_READER } from './application/ports/service.reader';
import { SERVICE_WRITER } from './application/ports/service.writer';
import { GetPublicCatalogUseCase } from './application/use-cases/get-public-catalog.use-case';
import { CreateLocationUseCase } from './application/use-cases/locations/create-location.use-case';
import { EnsurePrincipalLocationUseCase } from './application/use-cases/locations/ensure-principal-location.use-case';
import { GetLocationUseCase } from './application/use-cases/locations/get-location.use-case';
import { ListLocationsUseCase } from './application/use-cases/locations/list-locations.use-case';
import { ResolveDefaultLocationUseCase } from './application/use-cases/locations/resolve-default-location.use-case';
import { SaveLocationScheduleUseCase } from './application/use-cases/locations/save-location-schedule.use-case';
import { UpdateLocationUseCase } from './application/use-cases/locations/update-location.use-case';
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
import { GetPublicAvailabilityUseCase } from './application/use-cases/settings/get-public-availability.use-case';
import { SavePublicAvailabilityUseCase } from './application/use-cases/settings/save-public-availability.use-case';
import { CatalogAdminService } from './catalog-admin.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { BOOKING_ACTIVITY_READER } from '../bookings/application/ports/booking-activity.reader';
import { MongoBookingActivityReader } from '../bookings/infrastructure/persistence/mongo/mongo-booking-activity.reader';
import { BookingActivityAdapter } from '../bookings/infrastructure/read-model/booking-activity.adapter';
import { CatalogPhotoController } from './infrastructure/http/catalog-photo.controller';
import { LocationsAdminController } from './infrastructure/http/locations-admin.controller';
import { ProfessionalPhotosAdminController } from './infrastructure/http/professional-photos-admin.controller';
import { ProfessionalsAdminController } from './infrastructure/http/professionals-admin.controller';
import { PublicAvailabilityAdminController } from './infrastructure/http/public-availability-admin.controller';
import { ScheduleAdminController } from './infrastructure/http/schedule-admin.controller';
import { ServicesAdminController } from './infrastructure/http/services-admin.controller';
import {
  BusinessSettingsRecord,
  BusinessSettingsSchema,
} from './infrastructure/persistence/mongo/business-settings.entity';
import { CatalogSeeder } from './infrastructure/persistence/mongo/catalog.seeder';
import {
  LocationRecord,
  LocationSchema,
} from './infrastructure/persistence/mongo/location.entity';
import { MongoBusinessSettingsRepository } from './infrastructure/persistence/mongo/mongo-business-settings.repository';
import { MongoLocationRepository } from './infrastructure/persistence/mongo/mongo-location.repository';
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
    LocationsAdminController,
    ScheduleAdminController,
    PublicAvailabilityAdminController,
  ],
  providers: [
    MongoProfessionalRepository,
    MongoServiceRepository,
    MongoLocationRepository,
    MongoBusinessSettingsRepository,
    { provide: PROFESSIONAL_READER, useExisting: MongoProfessionalRepository },
    { provide: PROFESSIONAL_WRITER, useExisting: MongoProfessionalRepository },
    {
      provide: PROFESSIONAL_PHOTO_STORE,
      useExisting: MongoProfessionalRepository,
    },
    { provide: SERVICE_READER, useExisting: MongoServiceRepository },
    { provide: SERVICE_WRITER, useExisting: MongoServiceRepository },
    { provide: LOCATION_READER, useExisting: MongoLocationRepository },
    { provide: LOCATION_WRITER, useExisting: MongoLocationRepository },
    {
      provide: LEGACY_SCHEDULE_READER,
      useExisting: MongoBusinessSettingsRepository,
    },
    {
      provide: PUBLIC_AVAILABILITY_READER,
      useExisting: MongoBusinessSettingsRepository,
    },
    {
      provide: PUBLIC_AVAILABILITY_WRITER,
      useExisting: MongoBusinessSettingsRepository,
    },
    // Temporary port: answered from the bookings collection until `bookings` migrates (spec 13).
    { provide: BOOKING_ACTIVITY_READER, useClass: MongoBookingActivityReader },
    { provide: BOOKING_ACTIVITY, useClass: BookingActivityAdapter },
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
    ListLocationsUseCase,
    GetLocationUseCase,
    ResolveDefaultLocationUseCase,
    EnsurePrincipalLocationUseCase,
    CreateLocationUseCase,
    UpdateLocationUseCase,
    SaveLocationScheduleUseCase,
    GetPublicAvailabilityUseCase,
    SavePublicAvailabilityUseCase,
    // Counts the bookings a schedule leaves out of hours (`admin`, until spec 14).
    {
      provide: UPCOMING_BOOKINGS_READER,
      useClass: MongoUpcomingBookingsReader,
    },
    CountAffectedBookingsUseCase,
    ScheduleImpactService,
    CatalogSeeder,
    CatalogService,
    CatalogAdminService,
  ],
  exports: [CatalogService, CatalogAdminService],
})
export class CatalogModule {}
