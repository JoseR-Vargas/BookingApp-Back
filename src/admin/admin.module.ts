import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Booking, BookingSchema } from '../bookings/schemas/booking.schema';
import { CatalogModule } from '../catalog/catalog.module';
import { AdminController } from './admin.controller';
import { ScheduleImpactService } from './schedule-impact';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Booking.name, schema: BookingSchema }]),
    CatalogModule,
  ],
  controllers: [AdminController],
  providers: [ScheduleImpactService],
})
export class AdminModule {}
