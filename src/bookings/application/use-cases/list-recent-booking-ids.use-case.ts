// ===== CASO DE USO: IDS DE LAS RESERVAS RECIENTES =====
// The panel asks for it to know whether a booking arrived. In a serverless
// deployment there is no live socket, so the panel polls (spec 26): only the
// ids travel, never the data of the client.

import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import { BOOKING_READER, BookingReader } from '../ports/booking.reader';

/** How many ids the panel asks for by default. */
export const DEFAULT_RECENT_IDS = 50;

@Injectable()
export class ListRecentBookingIdsUseCase {
  constructor(@Inject(BOOKING_READER) private readonly reader: BookingReader) {}

  async execute(limit: number = DEFAULT_RECENT_IDS): Promise<Result<string[]>> {
    const safe =
      Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_RECENT_IDS;
    return ok(await this.reader.findRecentIds(Math.min(safe, 200)));
  }
}
