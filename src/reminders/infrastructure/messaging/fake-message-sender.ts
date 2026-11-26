// ===== REMITENTE DE PRUEBA =====
// The sender of development, the e2e and the tests (spec 24): it answers that
// the message left, without a network. It is chosen with `REMINDERS_SENDER=fake`,
// the same way the payment gateway is chosen with `PAYMENT_GATEWAY`.

import { Injectable, Logger } from '@nestjs/common';
import {
  MessageSendResult,
  MessageSender,
  OutgoingMessage,
} from '../../application/ports/message-sender.port';
import { ReminderChannel } from '../../../shared/domain/reminders';

@Injectable()
export class FakeMessageSender implements MessageSender {
  readonly channel: ReminderChannel;

  private readonly logger = new Logger(FakeMessageSender.name);

  /** Everything it was asked to send, so a test can read it. */
  readonly sent: { to: string; subject: string; body: string }[] = [];

  constructor(channel: ReminderChannel) {
    this.channel = channel;
  }

  send(message: OutgoingMessage): Promise<MessageSendResult> {
    this.sent.push({
      to: message.to,
      subject: message.subject,
      body: message.body,
    });
    this.logger.log(`[fake] ${this.channel} -> ${message.to}`);
    return Promise.resolve({ ok: true });
  }
}
