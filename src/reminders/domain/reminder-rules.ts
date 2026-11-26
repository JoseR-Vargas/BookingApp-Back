// ===== REGLAS DE LOS RECORDATORIOS =====
// Which bookings need a reminder now, which window it is, whether it was
// already sent, which channels apply and how the text of the message is built
// (spec 24). Pure: the times and the data come in, the answers come out.

import {
  MAX_REMINDER_ATTEMPTS,
  ReminderChannel,
  ReminderRecord,
  ReminderSettings,
} from '../../shared/domain/reminders';

const HOUR_MS = 60 * 60 * 1000;

/** A window of anticipation: how many hours before the appointment it goes out. */
export interface ReminderWindow {
  /** How many hours before the start of the appointment. */
  hoursBefore: number;
  /** The label the log of the booking keeps: '24h', '3h'. */
  kind: string;
}

/** The label of a window. */
export const reminderKind = (hoursBefore: number): string => `${hoursBefore}h`;

/**
 * The windows of a configuration, from the farthest to the closest and
 * without repetitions. An empty configuration has no windows: nothing is
 * reminded.
 */
export function reminderWindows(hoursBefore: number[]): ReminderWindow[] {
  const unique = hoursBefore
    .filter((hours) => Number.isFinite(hours) && hours > 0)
    .filter((hours, index, all) => all.indexOf(hours) === index)
    .sort((a, b) => b - a);
  return unique.map((hours) => ({
    hoursBefore: hours,
    kind: reminderKind(hours),
  }));
}

/**
 * Whether the window of `hoursBefore` is open for an appointment that starts
 * at `startAt`: the reminder goes out from `startAt - hoursBefore` until the
 * appointment starts. A booking in the past is never reminded.
 */
export function isWindowDue(
  startAt: Date,
  now: Date,
  hoursBefore: number,
): boolean {
  const opensAt = startAt.getTime() - hoursBefore * HOUR_MS;
  const current = now.getTime();
  return current >= opensAt && current < startAt.getTime();
}

/** What the log of a booking says about a window and a channel. */
export type ReminderState =
  /** It was never sent (or it failed and may be tried again). */
  | 'pending'
  /** It left. */
  | 'sent'
  /** It failed and was tried enough times. */
  | 'exhausted';

/**
 * The state of the (window, channel) pair in the log of the booking: one
 * reminder per window and channel, and a failed one is tried again until it
 * has been tried `MAX_REMINDER_ATTEMPTS` times.
 */
export function reminderState(
  records: ReminderRecord[] | undefined,
  kind: string,
  channel: ReminderChannel,
): ReminderState {
  const found = (records ?? []).find(
    (record) => record.kind === kind && record.channel === channel,
  );
  if (!found) return 'pending';
  if (found.ok) return 'sent';
  return found.attempts >= MAX_REMINDER_ATTEMPTS ? 'exhausted' : 'pending';
}

/** How many times the (window, channel) pair was tried. */
export function reminderAttempts(
  records: ReminderRecord[] | undefined,
  kind: string,
  channel: ReminderChannel,
): number {
  const found = (records ?? []).find(
    (record) => record.kind === kind && record.channel === channel,
  );
  return found?.attempts ?? 0;
}

/**
 * The log with the record of the (window, channel) pair replaced, or with the
 * new record added: one entry per window and channel, never two.
 */
export function upsertReminder(
  records: ReminderRecord[] | undefined,
  record: ReminderRecord,
): ReminderRecord[] {
  const current = records ?? [];
  const index = current.findIndex(
    (entry) => entry.kind === record.kind && entry.channel === record.channel,
  );
  if (index < 0) return [...current, record];
  const next = [...current];
  next[index] = record;
  return next;
}

/** The contact the client left, if any. */
export interface ReminderContact {
  phone?: string;
  email?: string;
}

const hasText = (value: string | undefined): boolean =>
  typeof value === 'string' && value.trim() !== '';

/**
 * The channels a booking may be reminded through: the ones the business
 * allows and the client left a contact for. A client without email is
 * reminded through no channel at all.
 */
export function channelsForBooking(
  contact: ReminderContact,
  settings: ReminderSettings,
): ReminderChannel[] {
  const channels: ReminderChannel[] = [];
  if (settings.channels.includes('email') && hasText(contact.email)) {
    channels.push('email');
  }
  return channels;
}

/** The data the markers of the template are replaced with. */
export interface ReminderMessageData {
  cliente: string;
  fecha: string;
  hora: string;
  profesional: string;
  negocio: string;
  cancelar: string;
}

const MARKER = /\{(\w+)\}/g;

/**
 * The text of the message: every marker is replaced with its value and the
 * ones nobody knows stay as they are.
 */
export function renderReminderTemplate(
  template: string,
  data: ReminderMessageData,
): string {
  return template.replace(MARKER, (marker, key: string) => {
    const value = (data as unknown as Record<string, string | undefined>)[key];
    return value === undefined ? marker : value;
  });
}

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * 'YYYY-MM-DD' as a long Spanish date, e.g. 'Miércoles, 25 de marzo de 2026'.
 * The date of a booking is already the wall clock of the business.
 */
export function formatReminderDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) {
    return date;
  }
  const formatted = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(
    'es-ES',
    {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    },
  );
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/** The wall clock of an appointment, 'HH:MM'. */
export const formatReminderTime = (time: string): string => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
  return match ? `${pad(Number(match[1]))}:${match[2]}` : time;
};
