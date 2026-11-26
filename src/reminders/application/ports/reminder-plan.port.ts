// ===== PUERTO: EL PLAN DEL NEGOCIO =====
// Whether the plan of the business allows reminders (spec 24, spec 23). The
// rule lives in billing; the reminders only ask.

export interface ReminderPlan {
  /**
   * Whether the business may send reminders. A business without a
   * subscription is not governed by a plan and may send them.
   */
  allowsReminders(): Promise<boolean>;
}

export const REMINDER_PLAN = Symbol('REMINDER_PLAN');
