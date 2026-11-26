// ===== ELECCIÓN DEL REMITENTE =====
// Which sender the reminders use. `REMINDERS_SENDER=fake` uses the simulator
// (development and the e2e); anything else uses the real mailer.

import {
  MessageSender,
  MessageSenders,
} from '../../application/ports/message-sender.port';
import { FakeMessageSender } from './fake-message-sender';

export const SUPPORTED_REMINDER_SENDERS = ['real', 'fake'] as const;

/** Whether the simulated sender is in use. */
export const isFakeSender = (env: NodeJS.ProcessEnv = process.env): boolean =>
  (env.REMINDERS_SENDER ?? '').trim() === 'fake';

/** The senders of every channel, the real one or the simulator. */
export const selectMessageSenders = (
  env: NodeJS.ProcessEnv = process.env,
  real: { email: MessageSender } = { email: new FakeMessageSender('email') },
): MessageSenders => {
  const chosen = (env.REMINDERS_SENDER ?? '').trim() || 'real';
  if (!SUPPORTED_REMINDER_SENDERS.includes(chosen as never)) {
    throw new Error(
      `REMINDERS_SENDER="${chosen}" is not supported. Supported values: ${SUPPORTED_REMINDER_SENDERS.join(', ')}.`,
    );
  }
  if (chosen === 'fake') {
    return { email: new FakeMessageSender('email') };
  }
  return { email: real.email };
};
