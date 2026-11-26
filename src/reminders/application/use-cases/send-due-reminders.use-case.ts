// ===== CASO DE USO: ENVIAR LOS RECORDATORIOS QUE TOCAN =====
// The round of the scheduler (spec 24): which bookings of the business in
// force need a reminder now, and the ones that already left are left alone.
// Everything happens inside the scope of the business: it reads its bookings,
// its settings and its plan, and never the data of another business.

import { Inject, Injectable } from '@nestjs/common';
import {
  BOOKING_READER,
  BookingReader,
} from '../../../bookings/application/ports/booking.reader';
import {
  TENANT_REMINDERS_READER,
  TenantRemindersReader,
} from '../../../tenancy/application/ports/tenant-reminders.port';
import { Result, ok } from '../../../shared/domain/result';
import { isWindowDue, reminderWindows } from '../../domain/reminder-rules';
import { BUSINESS_TIME, BusinessTime } from '../ports/business-time.port';
import { REMINDER_PLAN, ReminderPlan } from '../ports/reminder-plan.port';
import { SendReminderUseCase } from './send-reminder.use-case';

const HOUR_MS = 60 * 60 * 1000;

/** Why a round did not send anything. */
export type RemindersSkip = 'disabled' | 'plan' | 'no_windows' | null;

/** What a round did. */
export interface SendDueRemindersOutcome {
  /** Why nothing was sent, when nothing was sent. */
  skipped: RemindersSkip;
  /** How many reminders left. */
  sent: number;
  /** How many failed (and are tried again in the next round). */
  failed: number;
}

@Injectable()
export class SendDueRemindersUseCase {
  constructor(
    @Inject(BOOKING_READER) private readonly reader: BookingReader,
    @Inject(TENANT_REMINDERS_READER)
    private readonly profile: TenantRemindersReader,
    @Inject(REMINDER_PLAN) private readonly plan: ReminderPlan,
    @Inject(BUSINESS_TIME) private readonly time: BusinessTime,
    private readonly sendReminder: SendReminderUseCase,
  ) {}

  /**
   * Sends the reminders that are due for the business in force. A business
   * that turned the reminders off, or whose plan does not allow them, sends
   * nothing.
   */
  async execute(): Promise<Result<SendDueRemindersOutcome>> {
    const profile = await this.profile.profile();
    const settings = profile.settings;
    if (!settings.enabled) {
      return ok({ skipped: 'disabled', sent: 0, failed: 0 });
    }
    if (!(await this.plan.allowsReminders())) {
      return ok({ skipped: 'plan', sent: 0, failed: 0 });
    }
    const windows = reminderWindows(settings.hoursBefore);
    if (windows.length === 0) {
      return ok({ skipped: 'no_windows', sent: 0, failed: 0 });
    }

    const now = this.time.now();
    const furthest = Math.max(...windows.map((window) => window.hoursBefore));
    const bookings = await this.reader.findByDateRange(
      this.time.dateOf(now),
      this.time.dateOf(new Date(now.getTime() + furthest * HOUR_MS)),
    );

    let sent = 0;
    let failed = 0;
    for (const booking of bookings) {
      if (booking.status === 'cancelled') {
        continue;
      }
      const startAt = this.time.instantOf(booking.date, booking.time);
      if (!startAt) {
        continue;
      }
      // The log of the booking is kept up to date between its windows: the
      // booking the store was read from does not know what was just sent.
      let records = booking.reminders ?? [];
      for (const window of windows) {
        if (!isWindowDue(startAt, now, window.hoursBefore)) {
          continue;
        }
        const result = await this.sendReminder.execute({
          booking,
          window,
          settings,
          businessName: profile.name,
          records,
        });
        if (!result.ok) return result;
        records = result.value.records;
        for (const outcome of result.value.outcomes) {
          if (outcome.ok) {
            sent++;
          } else if (!outcome.skipped) {
            failed++;
          }
        }
      }
    }

    return ok({ skipped: null, sent, failed });
  }
}
