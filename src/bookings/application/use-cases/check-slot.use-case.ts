import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { occupiedSlots } from '../../../availability/domain/occupancy.rules';
import { windowSlotsFor } from '../../domain/booking.rules';
import { BOOKING_CATALOG, BookingCatalog } from '../ports/booking-catalog.port';
import { BOOKING_READER, BookingReader } from '../ports/booking.reader';

export interface CheckSlotInput {
  date: string;
  time: string;
  professionalId: string;
  serviceIds: string[];
  /** Without it the default location is used. */
  locationId?: string;
}

/** Whether the professional can perform all the services starting at `time`. */
@Injectable()
export class CheckSlotUseCase {
  constructor(
    @Inject(BOOKING_CATALOG) private readonly catalog: BookingCatalog,
    @Inject(BOOKING_READER) private readonly reader: BookingReader,
  ) {}

  async execute(
    input: CheckSlotInput,
  ): Promise<Result<{ available: boolean }>> {
    const selection = await this.catalog.resolveServices(
      Array.isArray(input.serviceIds) ? input.serviceIds : [],
    );
    if (!selection.ok) return selection;

    // An unknown or inactive location is simply not available.
    const location = await this.catalog.getLocation(
      typeof input.locationId === 'string' ? input.locationId : undefined,
    );
    if (!location.ok) return ok({ available: false });

    const schedule = await this.catalog.getSchedule(location.value.id);
    if (!schedule.ok) return schedule;
    const slots = windowSlotsFor(
      input.date,
      input.time,
      selection.value.totalDuration,
      schedule.value,
    );
    const offersAll = selection.value.professionals.includes(
      input.professionalId,
    );
    if (
      !slots ||
      !offersAll ||
      !(await this.catalog.worksAtLocation(
        input.professionalId,
        location.value.id,
      ))
    ) {
      return ok({ available: false });
    }

    const occupied = occupiedSlots(
      await this.reader.findOccupiedSlots(input.date, input.professionalId),
    );
    return ok({ available: slots.every((slot) => !occupied.has(slot)) });
  }
}
