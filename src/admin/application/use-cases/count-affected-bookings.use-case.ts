// ===== CASO DE USO: RESERVAS AFECTADAS =====
// How many upcoming bookings a schedule change leaves out of hours.

import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { WeeklySchedule } from '../../../shared/domain/schedule/schedule';
import {
  LocationScope,
  ScheduledBooking,
  isOutsideSchedule,
} from '../../domain/schedule-impact.rules';
import {
  UPCOMING_BOOKINGS_READER,
  UpcomingBookingsReader,
} from '../ports/upcoming-bookings.reader';

@Injectable()
export class CountAffectedBookingsUseCase {
  constructor(
    @Inject(UPCOMING_BOOKINGS_READER)
    private readonly reader: UpcomingBookingsReader,
  ) {}

  /**
   * Non-cancelled bookings from `today` on that `schedule` no longer fits.
   * With a `scope`, only the bookings of that location count (a booking
   * without location counts for the default one).
   */
  async execute(
    schedule: WeeklySchedule,
    today: string,
    scope?: LocationScope,
  ): Promise<Result<number>> {
    const upcoming = await this.reader.findUpcoming(today, scope);
    return ok(
      upcoming.filter(
        (booking: ScheduledBooking) =>
          (!scope ||
            (booking.location?.id ?? scope.defaultLocationId) ===
              scope.locationId) &&
          isOutsideSchedule(booking, schedule),
      ).length,
    );
  }
}
