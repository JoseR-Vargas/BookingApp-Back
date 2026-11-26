/** The counters behind the admin statistics. A failure of the store throws. */
export interface BookingStatisticsReader {
  /** Every booking, whatever its status. */
  countAll(): Promise<number>;
  /** The sum of `totalPrice` of every booking, whatever its status (0 without bookings). */
  totalRevenue(): Promise<number>;
  /** The bookings dated `date` ('YYYY-MM-DD'), whatever their status. */
  countOnDate(date: string): Promise<number>;
}

export const BOOKING_STATISTICS_READER = Symbol('BOOKING_STATISTICS_READER');
