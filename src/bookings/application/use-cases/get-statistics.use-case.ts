import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, Clock } from '../../../shared/application/clock.port';
import { Result, ok } from '../../../shared/domain/result';
import { BookingStatistics } from '../../domain/booking';
import { buildStatistics, utcDateOf } from '../../domain/statistics.rules';
import {
  BOOKING_STATISTICS_READER,
  BookingStatisticsReader,
} from '../ports/booking-statistics.reader';

/** Totals for the admin panel; "today" is the UTC date. */
@Injectable()
export class GetStatisticsUseCase {
  constructor(
    @Inject(BOOKING_STATISTICS_READER)
    private readonly statistics: BookingStatisticsReader,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<Result<BookingStatistics>> {
    const totalBookings = await this.statistics.countAll();
    const totalRevenue = await this.statistics.totalRevenue();
    const todayBookings = await this.statistics.countOnDate(
      utcDateOf(this.clock.now()),
    );
    return ok(buildStatistics(totalBookings, totalRevenue, todayBookings));
  }
}
