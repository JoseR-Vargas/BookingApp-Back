// ===== REMITENTE (MAILER) =====
// The adapter of the mail provider the app uses.

import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import {
  EmailMessage,
  EmailSender,
} from '../application/ports/email-sender.port';

@Injectable()
export class MailerEmailSender implements EmailSender {
  constructor(private readonly mailerService: MailerService) {}

  async send(message: EmailMessage): Promise<void> {
    await this.mailerService.sendMail({
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
  }
}
