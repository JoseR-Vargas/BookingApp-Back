// ===== ADAPTADOR: MENSAJES EN MEMORIA =====
// The sender the tests use: it keeps what it was asked to send and can be
// told to fail or to report that the channel is not configured.

import { ReminderChannel } from '../../../shared/domain/reminders';
import {
  MessageSendResult,
  MessageSender,
  OutgoingMessage,
} from '../../application/ports/message-sender.port';

export class InMemoryMessageSender implements MessageSender {
  /** Everything that was sent. */
  readonly sent: OutgoingMessage[] = [];
  /** When it is set, the sends fail with this message. */
  failWith?: string;
  /** When it is true, the sender reports that the channel is not configured. */
  notConfigured = false;

  constructor(readonly channel: ReminderChannel) {}

  send(message: OutgoingMessage): Promise<MessageSendResult> {
    if (this.notConfigured) {
      return Promise.resolve({
        ok: false,
        skipped: true,
        error: 'El canal no está configurado.',
      });
    }
    if (this.failWith) {
      return Promise.resolve({ ok: false, error: this.failWith });
    }
    this.sent.push(message);
    return Promise.resolve({ ok: true });
  }
}
