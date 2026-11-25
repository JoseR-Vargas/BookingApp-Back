import { BookingStatistics } from './booking';

/** The UTC calendar date of an instant: what "today" means for the statistics. */
export const utcDateOf = (instant: Date): string =>
  instant.toISOString().split('T')[0];

export function buildStatistics(
  totalBookings: number,
  totalRevenue: number,
  todayBookings: number,
): BookingStatistics {
  return {
    totalBookings,
    totalRevenue: totalRevenue || 0,
    todayBookings,
  };
}
