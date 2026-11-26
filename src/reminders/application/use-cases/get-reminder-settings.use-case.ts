// ===== CASO DE USO: LOS RECORDATORIOS DEL NEGOCIO =====
// What the owner sees in the panel (spec 24): the configuration of the
// business, whether its plan allows reminders, how many reminders left and
// failed in the last days and the last ones that were sent.

import { Inject, Injectable } from '@nestjs/common';
import {
  BOOKING_READER,
  BookingReader,
} from '../../../bookings/application/ports/booking.reader';
import {
  TENANT_REMINDERS_READER,
  TenantRemindersReader,
} from '../../../tenancy/application/ports/tenant-reminders.port';
import {
  ReminderChannel,
  ReminderSettings,
} from '../../../shared/domain/reminders';
import { Result, ok } from '../../../shared/domain/result';
import { BUSINESS_TIME, BusinessTime } from '../ports/business-time.port';
import { REMINDER_PLAN, ReminderPlan } from '../ports/reminder-plan.port';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** How many days the counters look at. */
export const REMINDER_COUNTER_DAYS = 30;

/** How many reminders the panel lists. */
export const REMINDER_RECENT_LIMIT = 50;

/** One reminder of the list the panel reads. */
export interface ReminderEntry {
  /** The booking it belongs to. */
  bookingId: string;
  /** The window: '24h', '3h'. */
  kind: string;
  /** The channel it went through. */
  channel: ReminderChannel;
  /** When it was sent. */
  sentAt: Date;
  /** Whether it left. */
  ok: boolean;
  /** Why it did not leave, when it did not. */
  error: string | null;
  /** How many times it was tried. */
  attempts: number;
}

/** Everything the panel needs about the reminders. */
export interface ReminderSettingsState {
  /** The configuration of the business. */
  config: ReminderSettings;
  /** Whether the plan of the business allows reminders. */
  allowsReminders: boolean;
  /** How many reminders left and failed in the last days. */
  counters: { days: number; sent: number; failed: number };
  /** The last reminders that were sent. */
  recent: ReminderEntry[];
}

@Injectable()
export class GetReminderSettingsUseCase {
  constructor(
    @Inject(BOOKING_READER) private readonly reader: BookingReader,
    @Inject(TENANT_REMINDERS_READER)
    private readonly profile: TenantRemindersReader,
    @Inject(REMINDER_PLAN) private readonly plan: ReminderPlan,
    @Inject(BUSINESS_TIME) private readonly time: BusinessTime,
  ) {}

  async execute(
    days = REMINDER_COUNTER_DAYS,
  ): Promise<Result<ReminderSettingsState>> {
    const profile = await this.profile.profile();
    const allowsReminders = await this.plan.allowsReminders();

    const now = this.time.now();
    const since = new Date(now.getTime() - days * DAY_MS);
    // The bookings of the days that passed and of the days that come: a
    // reminder sent today for a booking of tomorrow is counted too.
    const furthest = Math.max(
      24,
      ...profile.settings.hoursBefore.filter((hours) => hours > 0),
    );
    const bookings = await this.reader.findByDateRange(
      this.time.dateOf(since),
      this.time.dateOf(new Date(now.getTime() + furthest * HOUR_MS)),
    );

    const entries: ReminderEntry[] = [];
    for (const booking of bookings) {
      for (const record of booking.reminders ?? []) {
        if (record.sentAt.getTime() < since.getTime()) {
          continue;
        }
        entries.push({
          bookingId: booking.id,
          kind: record.kind,
          channel: record.channel,
          sentAt: record.sentAt,
          ok: record.ok,
          error: record.error ?? null,
          attempts: record.attempts,
        });
      }
    }

    const sent = entries.filter((entry) => entry.ok).length;
    const failed = entries.length - sent;
    const recent = [...entries]
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
      .slice(0, REMINDER_RECENT_LIMIT);

    return ok({
      config: profile.settings,
      allowsReminders,
      counters: { days, sent, failed },
      recent,
    });
  }
}
