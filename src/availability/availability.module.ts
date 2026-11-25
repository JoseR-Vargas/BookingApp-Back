import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Booking, BookingSchema } from '../bookings/schemas/booking.schema';
import { BOOKING_ACTIVITY_READER } from '../bookings/application/ports/booking-activity.reader';
import { MongoBookingActivityReader } from '../bookings/infrastructure/persistence/mongo/mongo-booking-activity.reader';
import { BookingOccupiedSlotsReader } from '../bookings/infrastructure/read-model/booking-occupied-slots.reader';
import { CatalogModule } from '../catalog/catalog.module';
import { CLOCK } from '../shared/application/clock.port';
import { SystemClock } from '../shared/infrastructure/system.clock';
import { BUSINESS_CLOCK } from './application/ports/business-clock.port';
import { CATALOG_LOOKUP } from './application/ports/catalog-lookup.port';
import { OCCUPIED_SLOTS_READER } from './application/ports/occupied-slots.reader';
import { GetAvailabilityUseCase } from './application/use-cases/get-availability.use-case';
import { GetPublicAvailabilityUseCase } from './application/use-cases/get-public-availability.use-case';
import { AvailabilityService } from './availability.service';
import { CatalogFacadeLookup } from './infrastructure/catalog/catalog-facade.lookup';
import { AvailabilityController } from './infrastructure/http/availability.controller';
import { PublicAvailabilityController } from './infrastructure/http/public-availability.controller';

import { SystemBusinessClock } from './infrastructure/system-business-clock';

/**
 * Composition root of availability: the only place where ports are bound to
 * adapters. `AvailabilityService` is the temporary facade the WhatsApp bot
 * still calls.
 */
@Module({
  imports: [
    // Read-only, for the blocks already taken (answered by the bookings module, spec 14).
    MongooseModule.forFeature([{ name: Booking.name, schema: BookingSchema }]),
    CatalogModule,
  ],
  controllers: [AvailabilityController, PublicAvailabilityController],
  providers: [
    // Temporary ports: they read data of modules that have not migrated yet.
    { provide: BOOKING_ACTIVITY_READER, useClass: MongoBookingActivityReader },
    { provide: OCCUPIED_SLOTS_READER, useClass: BookingOccupiedSlotsReader },
    { provide: CATALOG_LOOKUP, useClass: CatalogFacadeLookup }, // facade deleted (specs 17 and 26)
    { provide: CLOCK, useClass: SystemClock },
    { provide: BUSINESS_CLOCK, useClass: SystemBusinessClock },
    GetAvailabilityUseCase,
    GetPublicAvailabilityUseCase,
    AvailabilityService,
  ],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
