// ===== PRESENTADOR DE LOS RECORDATORIOS =====
// The JSON the admin panel reads: the configuration of the business, whether
// its plan allows reminders, the counters of the last days and the last
// reminders that were sent.

import { ReminderChannel } from '../../../shared/domain/reminders';
import {
  ReminderEntry,
  ReminderSettingsState,
} from '../../application/use-cases/get-reminder-settings.use-case';

type Json = Record<string, unknown>;

/** One reminder of the list the panel reads. */
export interface ReminderEntryJson {
  bookingId: string;
  kind: string;
  channel: ReminderChannel;
  sentAt: Date;
  ok: boolean;
  error: string | null;
  attempts: number;
}

/** Everything the panel needs about the reminders of the business. */
export interface ReminderSettingsJson {
  config: {
    enabled: boolean;
    channels: ReminderChannel[];
    hoursBefore: number[];
    template: string;
  };
  allowsReminders: boolean;
  counters: {
    days: number;
    sent: number;
    failed: number;
  };
  recent: ReminderEntryJson[];
}

/** One reminder of the list. */
export function toReminderEntryJson(entry: ReminderEntry): ReminderEntryJson {
  return {
    bookingId: entry.bookingId,
    kind: entry.kind,
    channel: entry.channel,
    sentAt: entry.sentAt,
    ok: entry.ok,
    error: entry.error,
    attempts: entry.attempts,
  };
}

/** The state of the reminders as the panel reads it. */
export function toReminderSettingsJson(
  state: ReminderSettingsState,
): ReminderSettingsJson {
  return {
    config: {
      enabled: state.config.enabled,
      channels: state.config.channels,
      hoursBefore: state.config.hoursBefore,
      template: state.config.template,
    },
    allowsReminders: state.allowsReminders,
    counters: {
      days: state.counters.days,
      sent: state.counters.sent,
      failed: state.counters.failed,
    },
    recent: state.recent.map(toReminderEntryJson),
  };
}

/** The JSON of a saved configuration. */
export const toReminderConfigJson = (
  config: ReminderSettingsJson['config'],
): Json => ({ ...config });
