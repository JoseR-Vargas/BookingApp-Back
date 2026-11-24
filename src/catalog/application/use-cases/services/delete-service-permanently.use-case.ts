import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../../shared/domain/result';
import { ServiceNotFoundError } from '../../../domain/catalog.errors';
import { ensureServiceHasNoUpcomingBookings } from '../../../domain/deletion.rules';
import {
  BOOKING_ACTIVITY,
  BookingActivity,
} from '../../ports/booking-activity.port';
import { SERVICE_READER, ServiceReader } from '../../ports/service.reader';
import { SERVICE_WRITER, ServiceWriter } from '../../ports/service.writer';

export interface DeleteServiceCommand {
  id: string;
  /** Today, 'YYYY-MM-DD', in the business timezone. */
  today: string;
}

/**
 * Permanently deletes a service. Refused while it has confirmed bookings from
 * `today` on (a booking with several services counts once). Bookings keep
 * their own snapshot of the service.
 *
 * The check and the delete are not one transaction: a booking confirmed
 * between them is not detected and would reference a deleted service.
 */
@Injectable()
export class DeleteServicePermanentlyUseCase {
  constructor(
    @Inject(SERVICE_READER) private readonly reader: ServiceReader,
    @Inject(SERVICE_WRITER) private readonly writer: ServiceWriter,
    @Inject(BOOKING_ACTIVITY) private readonly activity: BookingActivity,
  ) {}

  async execute(
    command: DeleteServiceCommand,
  ): Promise<Result<{ id: string; deleted: true }>> {
    const { id, today } = command;
    const service = await this.reader.find(id);
    if (!service) return err(new ServiceNotFoundError(id));

    const bookings = ensureServiceHasNoUpcomingBookings(
      service.name,
      await this.activity.countUpcomingConfirmedForService(id, today),
    );
    if (!bookings.ok) return bookings;

    await this.writer.delete(id);
    return ok({ id, deleted: true });
  }
}
