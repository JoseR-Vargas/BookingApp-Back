// ===== PUERTO: EL TIEMPO DEL NEGOCIO =====
// The instant of the business and the wall clock of its appointments (spec
// 24). The reminders are scheduled against the timezone of the business, so
// the use cases never read the system clock nor the environment.

export interface BusinessTime {
  /** The current instant. */
  now(): Date;
  /**
   * The instant of a wall clock of the business ('YYYY-MM-DD' and 'HH:MM'),
   * or null when the timezone is unknown or the data is not a real date.
   */
  instantOf(date: string, time: string): Date | null;
  /** The date ('YYYY-MM-DD') of an instant at the business. */
  dateOf(instant: Date): string;
}

export const BUSINESS_TIME = Symbol('BUSINESS_TIME');
