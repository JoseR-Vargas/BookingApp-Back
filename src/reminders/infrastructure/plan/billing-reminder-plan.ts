// ===== ADAPTADOR: EL PLAN DEL NEGOCIO =====
// Whether the plan of the business allows reminders (spec 23, spec 24). The
// rule lives in billing: this adapter only asks for the status of the plan
// and reads its limits. A business without a subscription is not governed by
// a plan and may send reminders.

import { Injectable, Logger } from '@nestjs/common';
import { GetSubscriptionStatusUseCase } from '../../../billing/application/use-cases/get-subscription-status.use-case';
import { ReminderPlan } from '../../application/ports/reminder-plan.port';

@Injectable()
export class BillingReminderPlan implements ReminderPlan {
  private readonly logger = new Logger(BillingReminderPlan.name);

  constructor(private readonly status: GetSubscriptionStatusUseCase) {}

  async allowsReminders(): Promise<boolean> {
    const result = await this.status.execute();
    if (!result.ok) {
      this.logger.warn(
        `The plan could not be read, no reminder is sent: ${result.error.message}`,
      );
      return false;
    }
    const plan = result.value;
    if (!plan) {
      // No subscription: the business is not governed by a plan.
      return true;
    }
    return plan.limits.reminders;
  }
}
