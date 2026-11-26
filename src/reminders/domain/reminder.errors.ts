// ===== ERRORES DE LOS RECORDATORIOS =====
// The business failures of the reminders (spec 24). They never mention HTTP.

import { DomainError } from '../../shared/domain/domain-error';

/** The reminder settings of the business are not acceptable. */
export class InvalidReminderSettings extends DomainError {
  constructor(message: string) {
    super('validation', message);
  }
}
