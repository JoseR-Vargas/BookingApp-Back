import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { Booking } from '../../domain/booking';
import { BOOKING_READER, BookingReader } from '../ports/booking.reader';

/** One booking by id; a missing one is `ok(null)` (the admin routes answer an empty body). */
@Injectable()
export class GetBookingUseCase {
  constructor(@Inject(BOOKING_READER) private readonly reader: BookingReader) {}

  async execute(id: string): Promise<Result<Booking | null>> {
    return ok(await this.reader.findById(id));
  }
}
