import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { Booking } from '../../domain/booking';
import { BOOKING_WRITER, BookingWriter } from '../ports/booking.writer';

/** Deletes a booking; `ok(null)` when it did not exist. */
@Injectable()
export class DeleteBookingUseCase {
  constructor(@Inject(BOOKING_WRITER) private readonly writer: BookingWriter) {}

  async execute(id: string): Promise<Result<Booking | null>> {
    return ok(await this.writer.delete(id));
  }
}
