import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  dayOfWeekFromIsoDate,
  toMinutes,
} from '../availability/availability.calculator';
import { WeeklySchedule } from '../catalog/catalog.config';
import { Booking } from '../bookings/schemas/booking.schema';
import { getBusinessNow } from '../whatsapp/bot/business-time';

/** The part of a booking needed to tell whether a schedule still fits it. */
export interface ScheduledBooking {
  date: string;
  time: string;
  slots?: string[];
}

/** Today's 'YYYY-MM-DD': business timezone if valid, otherwise the UTC date. */
export function currentBusinessDate(
  instant: Date = new Date(),
  timezone: string | undefined = process.env.BUSINESS_TIMEZONE,
): string {
  return (
    getBusinessNow(timezone, instant)?.date ??
    instant.toISOString().slice(0, 10)
  );
}

/**
 * Whether the booking's day is closed in `schedule` or any slot it occupies
 * falls outside the open window [open, close). Bookings without slots (legacy
 * data) are judged by their start time. Invalid dates are never counted.
 */
export function isOutsideSchedule(
  booking: ScheduledBooking,
  schedule: WeeklySchedule,
): boolean {
  const dayOfWeek = dayOfWeekFromIsoDate(booking.date);
  if (dayOfWeek === null) {
    return false;
  }
  const day = schedule.weekly[dayOfWeek];
  if (day.closed) {
    return true;
  }
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  const times = booking.slots?.length ? booking.slots : [booking.time];
  return times.some((time) => {
    const start = toMinutes(time);
    return (
      start === null ||
      open === null ||
      close === null ||
      start < open ||
      start >= close
    );
  });
}

/** Measures how many upcoming bookings a schedule change leaves out of hours. */
@Injectable()
export class ScheduleImpactService {
  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<Booking>,
  ) {}

  /** Non-cancelled bookings from `today` on that `schedule` no longer fits. */
  async countAffected(
    schedule: WeeklySchedule,
    today: string,
  ): Promise<number> {
    const upcoming = await this.bookingModel
      .find(
        { date: { $gte: today }, status: { $ne: 'cancelled' } },
        { date: 1, time: 1, slots: 1 },
      )
      .lean<ScheduledBooking[]>()
      .exec();
    return upcoming.filter((booking) => isOutsideSchedule(booking, schedule))
      .length;
  }
}
