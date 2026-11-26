// ===== RECORDATORIOS (VOCABULARIO COMPARTIDO) =====
// The model of the reminders of a business (spec 24). It lives in the shared
// kernel because three modules speak of it: `tenancy` stores the settings in
// the business, `bookings` keeps the log of what was sent on the booking and
// `reminders` owns the rules. Pure data: no framework, no clock, no I/O.

/** The channels a reminder may leave through. */
export const REMINDER_CHANNELS = ['whatsapp', 'email'] as const;

export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

/** How a business wants its reminders: the channels, the anticipation and the text. */
export interface ReminderSettings {
  /** Whether the business wants reminders at all. */
  enabled: boolean;
  /** The channels it allows; a client is only reminded through the ones it left a contact for. */
  channels: ReminderChannel[];
  /** How many hours before the appointment each reminder goes out (24 and 3 by default). */
  hoursBefore: number[];
  /** The text of the message, with the markers `{cliente} {fecha} {hora} {profesional} {negocio} {cancelar}`. */
  template: string;
}

/** The anticipation every business starts with. */
export const DEFAULT_REMINDER_HOURS_BEFORE: readonly number[] = [24, 3];

/**
 * The text a business starts with: it names the business, the date, the hour,
 * the professional and the link to cancel, and nothing else.
 */
export const DEFAULT_REMINDER_TEMPLATE =
  'Hola {cliente}, te recordamos tu cita en {negocio}: {fecha} a las {hora} con {profesional}. Si necesitas cancelar, entra aquí: {cancelar}';

/** The settings of a business that never saved any. */
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  channels: ['whatsapp', 'email'],
  hoursBefore: [...DEFAULT_REMINDER_HOURS_BEFORE],
  template: DEFAULT_REMINDER_TEMPLATE,
};

/** A fresh copy of the default settings, so nobody changes them by accident. */
export const defaultReminderSettings = (): ReminderSettings => ({
  ...DEFAULT_REMINDER_SETTINGS,
  channels: [...DEFAULT_REMINDER_SETTINGS.channels],
  hoursBefore: [...DEFAULT_REMINDER_SETTINGS.hoursBefore],
});

/** One reminder of the log a booking keeps. */
export interface ReminderRecord {
  /** The window it belongs to: '24h', '3h'. */
  kind: string;
  /** The channel it went through. */
  channel: ReminderChannel;
  /** When it was sent. */
  sentAt: Date;
  /** Whether it left. */
  ok: boolean;
  /** Why it did not leave, when it did not. */
  error?: string;
  /** How many times it was tried (the first try is 1). */
  attempts: number;
}

/** How many times a failed reminder is tried before it is given up. */
export const MAX_REMINDER_ATTEMPTS = 3;
