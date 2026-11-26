import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookingStatisticsReader } from '../../../application/ports/booking-statistics.reader';
import { Booking as BookingRecord } from './booking.entity';

/** Counts and sums over the `bookings` collection. */
@Injectable()
export class MongoBookingStatistics implements BookingStatisticsReader {
  constructor(
    @InjectModel(BookingRecord.name)
    private readonly model: Model<BookingRecord>,
  ) {}

  countAll(): Promise<number> {
    return Promise.resolve(this.model.countDocuments());
  }

  async totalRevenue(): Promise<number> {
    const revenue = await this.model.aggregate<{ total: number }>([
      {
        $group: {
          _id: null,
          total: { $sum: '$totalPrice' },
        },
      },
    ]);
    return revenue[0]?.total || 0;
  }

  countOnDate(date: string): Promise<number> {
    return Promise.resolve(this.model.countDocuments({ date }));
  }
}
