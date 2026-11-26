import type { OccupiedBooking } from '../../../domain/availability';
import type { SeedOccupancy } from '../../../application/ports/occupied-slots.reader.contract';
import type { OccupiedSlotsReader } from '../../../application/ports/occupied-slots.reader';

/** Keeps the bookings in memory: the swap proof and the adapter of use case tests. */
export class InMemoryOccupiedSlotsReader implements OccupiedSlotsReader {
  private bookings: SeedOccupancy[] = [];

  /** Records a booking, bypassing the port. */
  seed(booking: SeedOccupancy): void {
    this.bookings.push({ ...booking, slots: [...booking.slots] });
  }

  findOccupied(
    date: string,
    professionalIds: string[],
  ): Promise<OccupiedBooking[]> {
    return Promise.resolve(
      this.bookings
        .filter(
          (b) =>
            b.date === date &&
            b.status !== 'cancelled' &&
            professionalIds.includes(b.professionalId),
        )
        .map((b) => ({
          professionalId: b.professionalId,
          slots: [...b.slots],
        })),
    );
  }
}
