import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../shared/domain/result';
import {
  BUSINESS_CLOCK,
  BusinessClock,
} from '../../../availability/application/ports/business-clock.port';
import {
  CancellationSummary,
  cancelStateOf,
  foundByToken,
  isCancelTokenShape,
  toCancellationSummary,
} from '../../domain/cancellation.rules';
import { BookingNotFound } from '../../domain/booking.errors';
import { BOOKING_READER, BookingReader } from '../ports/booking.reader';
import { CANCEL_TOKENS, CancelTokens } from '../ports/cancel-tokens.port';
import { Booking } from '../../domain/booking';

/**
 * The booking that owns `token`. A malformed and an unknown token answer
 * alike, and a malformed one never reaches the store.
 */
export async function findByCancelToken(
  reader: BookingReader,
  tokens: CancelTokens,
  token: string,
): Promise<Result<Booking>> {
  if (!isCancelTokenShape(token)) {
    return err(new BookingNotFound());
  }
  return foundByToken(await reader.findByCancelTokenHash(tokens.hash(token)));
}

/** Public cancel page: what the booking is and whether it can still be cancelled. */
@Injectable()
export class GetCancellationUseCase {
  constructor(
    @Inject(BOOKING_READER) private readonly reader: BookingReader,
    @Inject(CANCEL_TOKENS) private readonly tokens: CancelTokens,
    @Inject(BUSINESS_CLOCK) private readonly clock: BusinessClock,
  ) {}

  async execute(token: string): Promise<Result<CancellationSummary>> {
    const booking = await findByCancelToken(this.reader, this.tokens, token);
    if (!booking.ok) return booking;
    const state = cancelStateOf(booking.value, this.clock.now());
    if (!state.ok) return state;
    return ok(toCancellationSummary(booking.value, state.value));
  }
}
