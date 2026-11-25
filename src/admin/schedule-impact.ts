// ===== IMPACTO DEL HORARIO (FACHADA) =====
// How many upcoming bookings a schedule change leaves out of hours. The rules
// live in `domain/` (pure) and the count in a use case; this keeps the
// interface the rest of the app has used so far.

import { Injectable } from '@nestjs/common';
import { WeeklySchedule } from '../shared/domain/schedule/schedule';
import { CountAffectedBookingsUseCase } from './application/use-cases/count-affected-bookings.use-case';
import {
  LocationScope,
  currentBusinessDate as businessDateOf,
} from './domain/schedule-impact.rules';

export { isOutsideSchedule } from './domain/schedule-impact.rules';
export type {
  LocationScope,
  ScheduledBooking,
} from './domain/schedule-impact.rules';

/**
 * Today's 'YYYY-MM-DD': business timezone if valid, otherwise the UTC date.
 * The environment is read here (the edge), never in the rule.
 */
export function currentBusinessDate(
  instant: Date = new Date(),
  timezone: string | undefined = process.env.BUSINESS_TIMEZONE,
): string {
  return (
    businessDateOf(instant, timezone) ?? instant.toISOString().slice(0, 10)
  );
}

/** Measures how many upcoming bookings a schedule change leaves out of hours. */
@Injectable()
export class ScheduleImpactService {
  constructor(private readonly count: CountAffectedBookingsUseCase) {}

  async countAffected(
    schedule: WeeklySchedule,
    today: string,
    scope?: LocationScope,
  ): Promise<number> {
    const result = await this.count.execute(schedule, today, scope);
    return result.ok ? result.value : 0;
  }
}
