import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import {
  BUSINESS_CLOCK,
  BusinessClock,
} from '../../../availability/application/ports/business-clock.port';
import {
  CancellationSummary,
  cancelStateOf,
  ensureCancellable,
  toCancellationSummary,
} from '../../domain/cancellation.rules';
import {
  BOOKING_NOTIFIER,
  BookingNotifier,
} from '../ports/booking-notifier.port';
import { BOOKING_READER, BookingReader } from '../ports/booking.reader';
import { BOOKING_WRITER, BookingWriter } from '../ports/booking.writer';
import { CANCEL_TOKENS, CancelTokens } from '../ports/cancel-tokens.port';
import { findByCancelToken } from './get-cancellation.use-case';

/**
 * Cancels the booking that owns `token`, up to one minute before it starts.
 * Idempotent: an already cancelled booking answers its summary, and of two
 * simultaneous requests only one cancels and announces it.
 */
@Injectable()
export class CancelBookingByTokenUseCase {
  constructor(
    @Inject(BOOKING_READER) private readonly reader: BookingReader,
    @Inject(BOOKING_WRITER) private readonly writer: BookingWriter,
    @Inject(CANCEL_TOKENS) private readonly tokens: CancelTokens,
    @Inject(BUSINESS_CLOCK) private readonly clock: BusinessClock,
    @Inject(BOOKING_NOTIFIER) private readonly notifier: BookingNotifier,
  ) {}

  async execute(token: string): Promise<Result<CancellationSummary>> {
    const found = await findByCancelToken(this.reader, this.tokens, token);
    if (!found.ok) return found;
    const booking = found.value;

    const state = cancelStateOf(booking, this.clock.now());
    if (!state.ok) return state;
    if (state.value === 'cancelled') {
      return ok(toCancellationSummary(booking, 'cancelled'));
    }
    const open = ensureCancellable(state.value);
    if (!open.ok) return open;

    const cancelled = await this.writer.cancelIfConfirmed(booking.id);
    if (!cancelled) {
      // Another request cancelled it first: nothing changed here, nothing to announce.
      return ok(toCancellationSummary(booking, 'cancelled'));
    }

    await this.notifier.cancelled(cancelled);
    return ok(toCancellationSummary(cancelled, 'cancelled'));
  }
}
