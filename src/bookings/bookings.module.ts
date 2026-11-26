// ===== MÓDULO DE RESERVAS =====
// Composition root of the bookings module: every port is bound to its adapter here, and nothing
// else in the module knows which implementation it got.

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BOOKING_ACTIVITY_READER } from './application/ports/booking-activity.reader';
import { BOOKING_CATALOG } from './application/ports/booking-catalog.port';
import { BOOKING_NOTIFIER } from './application/ports/booking-notifier.port';
import { BOOKING_READER } from './application/ports/booking.reader';
import { BOOKING_STATISTICS_READER } from './application/ports/booking-statistics.reader';
import { BOOKING_WRITER } from './application/ports/booking.writer';
import { CANCEL_TOKENS } from './application/ports/cancel-tokens.port';
import { TRIAL_GATE } from './application/ports/trial-gate.port';
import { TenancyTrialGate } from './infrastructure/trial/tenancy-trial-gate';
import { CancelBookingByTokenUseCase } from './application/use-cases/cancel-booking-by-token.use-case';
import { CheckSlotUseCase } from './application/use-cases/check-slot.use-case';
import { CreateBookingUseCase } from './application/use-cases/create-booking.use-case';
import { DeleteBookingUseCase } from './application/use-cases/delete-booking.use-case';
import { GetBookingUseCase } from './application/use-cases/get-booking.use-case';
import { GetCancellationUseCase } from './application/use-cases/get-cancellation.use-case';
import { GetStatisticsUseCase } from './application/use-cases/get-statistics.use-case';
import { ListBookingsUseCase } from './application/use-cases/list-bookings.use-case';
import { UpdateBookingUseCase } from './application/use-cases/update-booking.use-case';
import { BookingsService } from './bookings.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { BookingsGateway } from './bookings.gateway';
import { NodeCancelTokens } from './infrastructure/crypto/node-cancel-tokens';
import { BookingsController } from './infrastructure/http/bookings.controller';
import {
  AdminWhatsappBookingNotifier,
  CompositeBookingNotifier,
  EmailBookingNotifier,
  SocketBookingNotifier,
} from './infrastructure/notifications/booking.notifiers';
import { MongoBookingActivityReader } from './infrastructure/persistence/mongo/mongo-booking-activity.reader';

import { InMemoryBookingStatistics } from './infrastructure/persistence/in-memory/in-memory-booking-statistics';
import { InMemoryBookingRepository } from './infrastructure/persistence/in-memory/in-memory-booking.repository';
import {
  Booking,
  BookingSchema,
} from './infrastructure/persistence/mongo/booking.entity';
import { MongoBookingStatistics } from './infrastructure/persistence/mongo/mongo-booking-statistics';
import { MongoBookingRepository } from './infrastructure/persistence/mongo/mongo-booking.repository';
import { CatalogBookingAdapter } from './infrastructure/catalog/catalog-booking.adapter';
import { CLOCK } from '../shared/application/clock.port';
import {
  AVAILABILITY_INVALIDATOR,
  AvailabilityInvalidator,
} from '../shared/application/availability-invalidator.port';
import { invalidatingWriter } from '../shared/infrastructure/cache/invalidating-writer';
import { SystemClock } from '../shared/infrastructure/system.clock';
import { BUSINESS_CLOCK } from '../availability/application/ports/business-clock.port';
import { SystemBusinessClock } from '../availability/infrastructure/system-business-clock';
import { EmailModule } from '../email/email.module';
import { EmailService } from '../email/email.service';
import { CatalogModule } from '../catalog/catalog.module';
import { WhatsappApiModule } from '../whatsapp/whatsapp-api.module';
import { AdminBookingNotifier } from '../whatsapp/admin-booking.notifier';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Booking.name, schema: BookingSchema }]),
    EmailModule,
    CatalogModule,
    TenancyModule,
    // Outbound only; WhatsappModule imports BookingsModule, never the reverse.
    WhatsappApiModule,
  ],
  controllers: [BookingsController],
  providers: [
    // Use cases.
    CreateBookingUseCase,
    ListBookingsUseCase,
    GetBookingUseCase,
    UpdateBookingUseCase,
    DeleteBookingUseCase,
    GetCancellationUseCase,
    CancelBookingByTokenUseCase,
    CheckSlotUseCase,
    GetStatisticsUseCase,
    // Ports -> adapters.
    MongoBookingRepository,
    { provide: BOOKING_READER, useExisting: MongoBookingRepository },
    // Every write tells the availability cache of the business to forget (spec 22).
    {
      provide: BOOKING_WRITER,
      useFactory: (
        repository: MongoBookingRepository,
        invalidator?: AvailabilityInvalidator,
      ) =>
        invalidatingWriter(repository, invalidator, [
          'create',
          'update',
          'delete',
          'cancelIfConfirmed',
        ]),
      inject: [
        MongoBookingRepository,
        { token: AVAILABILITY_INVALIDATOR, optional: true },
      ],
    },
    { provide: BOOKING_STATISTICS_READER, useClass: MongoBookingStatistics },
    { provide: BOOKING_ACTIVITY_READER, useClass: MongoBookingActivityReader },
    { provide: BOOKING_CATALOG, useClass: CatalogBookingAdapter },
    { provide: CANCEL_TOKENS, useClass: NodeCancelTokens },
    { provide: TRIAL_GATE, useClass: TenancyTrialGate },
    { provide: BUSINESS_CLOCK, useClass: SystemBusinessClock },
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: BOOKING_NOTIFIER,
      useFactory: (
        gateway: BookingsGateway,
        email: EmailService,
        admin: AdminBookingNotifier,
      ) => {
        const socket = new SocketBookingNotifier(gateway);
        const mail = new EmailBookingNotifier(email);
        const whatsapp = new AdminWhatsappBookingNotifier(admin);
        return new CompositeBookingNotifier([socket, mail, whatsapp]);
      },
      inject: [BookingsGateway, EmailService, AdminBookingNotifier],
    },
    // Facade (temporary) and live panel.
    BookingsService,
    BookingsGateway,
    // Test doubles, used by the specs that run without Mongo.
    InMemoryBookingRepository,
    InMemoryBookingStatistics,
  ],
  exports: [
    BookingsService,
    BookingsGateway,
    BOOKING_READER,
    BOOKING_WRITER,
    BOOKING_ACTIVITY_READER,
    BOOKING_STATISTICS_READER,
  ],
})
export class BookingsModule {}
