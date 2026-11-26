// ===== PUERTO: ENVÍO DE MENSAJES =====
// How a reminder leaves the system. The WhatsApp client and the mailer are
// two adapters of the same contract, so the use cases never know which
// provider is behind a channel (spec 24).

import { ReminderChannel } from '../../../shared/domain/reminders';

/** A message to deliver. */
export interface OutgoingMessage {
  /** The address: the phone for WhatsApp, the email for email. */
  to: string;
  /** The subject (only the email uses it). */
  subject: string;
  /** The text of the message. */
  body: string;
}

/** What happened to the message. */
export interface MessageSendResult {
  /** Whether it left. */
  ok: boolean;
  /** Why it did not leave, when it did not. */
  error?: string;
  /**
   * The channel is not configured: nothing was sent and nothing failed, so
   * the reminder is not recorded and it is tried again in the next round.
   */
  skipped?: boolean;
}

/** One channel's sender. */
export interface MessageSender {
  /** The channel it serves. */
  readonly channel: ReminderChannel;
  /** Sends the message; a failure of the provider is an answer, not an exception. */
  send(message: OutgoingMessage): Promise<MessageSendResult>;
}

/** The sender of every channel. */
export type MessageSenders = Record<ReminderChannel, MessageSender>;

export const MESSAGE_SENDERS = Symbol('MESSAGE_SENDERS');
