// ===== CASO DE USO: CORREO DE CANCELACIÓN =====
// Sends the email that tells the client the booking was cancelled.

import { Inject, Injectable } from '@nestjs/common';
import { Booking } from '../../../bookings/domain/booking';
import { cancellationEmail } from '../../domain/booking-email.templates';
import { EMAIL_SENDER, EmailSender } from '../ports/email-sender.port';
import { PUBLIC_APP_URL, PublicAppUrl } from '../ports/public-app-url.port';

@Injectable()
export class SendCancellationConfirmationUseCase {
  constructor(
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender,
    @Inject(PUBLIC_APP_URL) private readonly appUrl: PublicAppUrl,
  ) {}

  async execute(booking: Booking): Promise<void> {
    const { subject, html } = cancellationEmail(booking, {
      appUrl: this.appUrl.read(),
    });
    const to = booking.client.email;
    if (!to) return;
    await this.sender.send({ to, subject, html });
  }
}
