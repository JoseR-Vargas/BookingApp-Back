import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { BookingsGateway } from './bookings.gateway';
import { Booking, BookingSchema } from './schemas/booking.schema';
import { EmailModule } from '../email/email.module';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Booking.name, schema: BookingSchema }]),
    EmailModule,
    CatalogModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsGateway],
  exports: [BookingsGateway],
})
export class BookingsModule {}
