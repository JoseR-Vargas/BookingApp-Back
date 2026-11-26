// ===== PUERTO: RECORDATORIOS DEL NEGOCIO =====
// The reminder settings of the business in force and the name it shows in the
// messages (spec 24). The settings live in the record of the business, so the
// tenancy owns them.

import { ReminderSettings } from '../../../shared/domain/reminders';

/** What the messages of the business need to know about it. */
export interface TenantRemindersProfile {
  /** The name the business shows. */
  name: string;
  /** Its reminder settings; the defaults when it never saved any. */
  settings: ReminderSettings;
}

/** Reads the reminder settings of the business in force. */
export interface TenantRemindersReader {
  profile(): Promise<TenantRemindersProfile>;
}

export const TENANT_REMINDERS_READER = Symbol('TENANT_REMINDERS_READER');

/** Saves the reminder settings of the business in force. */
export interface TenantRemindersWriter {
  save(settings: ReminderSettings): Promise<ReminderSettings>;
}

export const TENANT_REMINDERS_WRITER = Symbol('TENANT_REMINDERS_WRITER');
