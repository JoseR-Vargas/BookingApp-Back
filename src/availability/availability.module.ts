import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Booking, BookingSchema } from '../bookings/schemas/booking.schema';
import { CatalogModule } from '../catalog/catalog.module';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { PublicAvailabilityController } from './public-availability.controller';
import { PublicAvailabilityService } from './public-availability.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Booking.name, schema: BookingSchema }]),
    CatalogModule,
  ],
  controllers: [AvailabilityController, PublicAvailabilityController],
  providers: [AvailabilityService, PublicAvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
