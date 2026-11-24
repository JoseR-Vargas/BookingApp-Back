import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../../shared/domain/result';
import { ProfessionalNotFoundError } from '../../../domain/catalog.errors';
import {
  ensureProfessionalHasNoUpcomingBookings,
  ensureProfessionalNotSoleProvider,
} from '../../../domain/deletion.rules';
import {
  BOOKING_ACTIVITY,
  BookingActivity,
} from '../../ports/booking-activity.port';
import {
  PROFESSIONAL_READER,
  ProfessionalReader,
} from '../../ports/professional.reader';
import {
  PROFESSIONAL_WRITER,
  ProfessionalWriter,
} from '../../ports/professional.writer';
import { SERVICE_READER, ServiceReader } from '../../ports/service.reader';
import { SERVICE_WRITER, ServiceWriter } from '../../ports/service.writer';

export interface DeleteProfessionalCommand {
  id: string;
  /** Today, 'YYYY-MM-DD', in the business timezone. */
  today: string;
}

/**
 * Permanently deletes a professional (and its photo). Refused while it has
 * confirmed bookings from `today` on or is the only professional of any
 * service. Services that keep other professionals just lose this id; every
 * booking is left untouched.
 *
 * The checks and the delete are not one transaction: a booking confirmed
 * between them is not detected and would reference a deleted professional.
 */
@Injectable()
export class DeleteProfessionalPermanentlyUseCase {
  constructor(
    @Inject(PROFESSIONAL_READER) private readonly reader: ProfessionalReader,
    @Inject(PROFESSIONAL_WRITER) private readonly writer: ProfessionalWriter,
    @Inject(SERVICE_READER) private readonly serviceReader: ServiceReader,
    @Inject(SERVICE_WRITER) private readonly serviceWriter: ServiceWriter,
    @Inject(BOOKING_ACTIVITY) private readonly activity: BookingActivity,
  ) {}

  async execute(
    command: DeleteProfessionalCommand,
  ): Promise<Result<{ id: string; deleted: true }>> {
    const { id, today } = command;
    const professional = await this.reader.find(id);
    if (!professional) return err(new ProfessionalNotFoundError(id));

    const bookings = ensureProfessionalHasNoUpcomingBookings(
      professional.name,
      await this.activity.countUpcomingConfirmed(id, today),
    );
    if (!bookings.ok) return bookings;

    const services = ensureProfessionalNotSoleProvider(
      professional.name,
      await this.serviceReader.offeredBy(id),
    );
    if (!services.ok) return services;

    await this.writer.delete(id);
    await this.serviceWriter.removeProfessional(id);
    return ok({ id, deleted: true });
  }
}
