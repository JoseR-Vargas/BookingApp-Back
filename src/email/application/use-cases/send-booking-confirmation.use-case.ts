// ===== CASO DE USO: CORREO DE CONFIRMACIÓN =====
// Sends the confirmation email of a booking. The subject and the HTML come
// from the domain; the address of the app and the transport come from ports.

import { Inject, Injectable } from '@nestjs/common';
import { Booking } from '../../../bookings/domain/booking';
import { EMAIL_SENDER, EmailSender } from '../ports/email-sender.port';
import { PUBLIC_APP_URL, PublicAppUrl } from '../ports/public-app-url.port';
import { bookingConfirmationEmail } from '../../domain/booking-email.templates';

@Injectable()
export class SendBookingConfirmationUseCase {
  constructor(
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
    @Inject(PUBLIC_APP_URL) private readonly appUrl: PublicAppUrl,
  ) {}

  async execute(booking: Booking, cancelToken?: string): Promise<void> {
    const { subject, html } = bookingConfirmationEmail(booking, {
      appUrl: this.appUrl.read(),
      cancelToken,
    });
    const to = booking.client.email;
    if (!to) return;
    await this.sender.send({ to, subject, html });
  }
}
