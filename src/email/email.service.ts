// ===== SERVICIO DE CORREO (FACHADA) =====
// Temporary facade over the email use cases, for the consumers that are not
// migrated yet (the booking notifications). It keeps the two methods the app
// has always called.

import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { Booking } from '../bookings/domain/booking';
import { SendBookingConfirmationUseCase } from './application/use-cases/send-booking-confirmation.use-case';
import { SendCancellationConfirmationUseCase } from './application/use-cases/send-cancellation-confirmation.use-case';

@Injectable()
export class EmailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly confirmation: SendBookingConfirmationUseCase,
    private readonly cancellation: SendCancellationConfirmationUseCase,
  ) {}

  /**
   * `cancelToken` is the one-time secret of the booking; with it (and a valid
   * PUBLIC_APP_URL) the email carries the cancel link.
   */
  async sendBookingConfirmation(
    booking: Booking,
    cancelToken?: string,
  ): Promise<void> {
    await this.confirmation.execute(booking, cancelToken);
  }

  async sendCancellationConfirmation(booking: Booking): Promise<void> {
    await this.cancellation.execute(booking);
  }
}
