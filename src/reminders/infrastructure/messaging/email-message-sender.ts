// ===== ADAPTADOR: ENVÍO POR CORREO =====
// The reminder through the mailer of the email module (spec 17, spec 24).

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EMAIL_SENDER,
  EmailSender,
} from '../../../email/application/ports/email-sender.port';
import {
  MessageSendResult,
  MessageSender,
  OutgoingMessage,
} from '../../application/ports/message-sender.port';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** The text of the message as the mail carries it. */
const toHtml = (body: string): string =>
  `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a2e;line-height:22px;">${escapeHtml(body).replace(/\r?\n/g, '<br/>')}</div>`;

@Injectable()
export class EmailMessageSender implements MessageSender {
  readonly channel = 'email' as const;

  private readonly logger = new Logger(EmailMessageSender.name);

  constructor(@Inject(EMAIL_SENDER) private readonly sender: EmailSender) {}

  async send(message: OutgoingMessage): Promise<MessageSendResult> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'Reminder skipped: the mailer is not configured (MAIL_FROM / GMAIL_USER)',
      );
      return {
        ok: false,
        skipped: true,
        error: 'El correo no está configurado (MAIL_FROM / GMAIL_USER).',
      };
    }
    try {
      await this.sender.send({
        to: message.to,
        subject: message.subject,
        html: toHtml(message.body),
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo enviar el recordatorio por correo.',
      };
    }
  }

  /** Whether the mailer of the application has somewhere to send from. */
  private isConfigured(): boolean {
    return Boolean(
      process.env.MAIL_FROM?.trim() || process.env.GMAIL_USER?.trim(),
    );
  }
}
