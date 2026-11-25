import { Inject, Injectable } from '@nestjs/common';
import { OccupiedSlotsReader } from '../../../availability/application/ports/occupied-slots.reader';
import { OccupiedBooking } from '../../../availability/domain/availability';
import {
  BOOKING_ACTIVITY_READER,
  BookingActivityReader,
} from '../../application/ports/booking-activity.reader';

/**
 * Answers availability's "which blocks are taken" from the bookings of this
 * module. Occupancy is per professional, wherever the booking happens.
 */
@Injectable()
export class BookingOccupiedSlotsReader implements OccupiedSlotsReader {
  constructor(
    @Inject(BOOKING_ACTIVITY_READER)
    private readonly bookings: BookingActivityReader,
  ) {}

  findOccupied(
    date: string,
    professionalIds: string[],
  ): Promise<OccupiedBooking[]> {
    return this.bookings.findOccupied(date, professionalIds);
  }
}
