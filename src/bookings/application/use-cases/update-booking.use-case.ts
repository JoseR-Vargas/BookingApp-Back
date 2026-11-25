import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { Booking } from '../../domain/booking';
import { BlockAlreadyTaken } from '../../domain/booking.errors';
import { UpdateRequest, planUpdate } from '../../domain/booking.rules';
import { BOOKING_CATALOG, BookingCatalog } from '../ports/booking-catalog.port';
import { BOOKING_READER, BookingReader } from '../ports/booking.reader';
import { BOOKING_WRITER, BookingWriter } from '../ports/booking.writer';
import { resolveSchedule } from './resolve-schedule';

/**
 * Edits a booking. Services, professional, slots and totals only change
 * through catalog resolution, and only when the schedule changes or a
 * cancelled booking comes back; the location never changes. `ok(null)` when
 * the booking does not exist.
 */
@Injectable()
export class UpdateBookingUseCase {
  constructor(
    @Inject(BOOKING_CATALOG) private readonly catalog: BookingCatalog,
    @Inject(BOOKING_READER) private readonly reader: BookingReader,
    @Inject(BOOKING_WRITER) private readonly writer: BookingWriter,
  ) {}

  async execute(
    id: string,
    request: UpdateRequest,
  ): Promise<Result<Booking | null>> {
    const current = await this.reader.findById(id);
    if (!current) {
      return ok(null);
    }

    const plan = planUpdate(current, request);
    const { changes, target } = plan;
    let professionalName = current.professional?.name;
    if (plan.resolveSchedule) {
      // The stored location is validated against and never changes; a
      // booking without one belongs to the default location.
      const place = current.location?.id
        ? ok({ id: current.location.id, name: current.location.name })
        : await this.catalog.getLocation();
      if (!place.ok) return place;

      const resolved = await resolveSchedule(
        this.catalog,
        this.reader,
        {
          serviceIds: target.serviceIds,
          professionalId: target.professionalId ?? '',
          date: target.date,
          time: target.time,
          location: place.value,
        },
        id,
      );
      if (!resolved.ok) return resolved;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { location: _unchanged, ...derived } = resolved.value;
      Object.assign(changes, derived);
      professionalName = resolved.value.professional.name;
    }

    return this.writer.update(
      id,
      changes,
      new BlockAlreadyTaken(professionalName, target.date, target.time),
    );
  }
}
