import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { Booking } from '../../domain/booking';
import { BOOKING_READER, BookingReader } from '../ports/booking.reader';

/** Every booking, for the admin panel. */
@Injectable()
export class ListBookingsUseCase {
  constructor(@Inject(BOOKING_READER) private readonly reader: BookingReader) {}

  async execute(): Promise<Result<Booking[]>> {
    return ok(await this.reader.findAll());
  }
}
