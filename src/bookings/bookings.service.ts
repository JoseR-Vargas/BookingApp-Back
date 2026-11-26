// ===== FACHADA DE RESERVAS (TEMPORAL) =====
// Thin facade over the use cases, for the consumers that are not migrated yet (the WhatsApp bot
// and the admin module). It keeps the signatures they call and translates the domain errors into
// the exceptions they already handle. It disappears when each consumer migrates.

import { Injectable } from '@nestjs/common';
import { Result } from '../shared/domain/result';
import { DomainError } from '../shared/domain/domain-error';
import { CancellationSummary } from './domain/cancellation.rules';
import { Booking, BookingStatistics } from './domain/booking';
import { CancelBookingByTokenUseCase } from './application/use-cases/cancel-booking-by-token.use-case';
import { CheckSlotUseCase } from './application/use-cases/check-slot.use-case';
import { CreateBookingUseCase } from './application/use-cases/create-booking.use-case';
import { DeleteBookingUseCase } from './application/use-cases/delete-booking.use-case';
import { GetBookingUseCase } from './application/use-cases/get-booking.use-case';
import { GetCancellationUseCase } from './application/use-cases/get-cancellation.use-case';
import { GetStatisticsUseCase } from './application/use-cases/get-statistics.use-case';
import { ListBookingsUseCase } from './application/use-cases/list-bookings.use-case';
import { UpdateBookingUseCase } from './application/use-cases/update-booking.use-case';

/**
 * The error the consumers of the old service expect: a plain `Error` with the
 * same message, so the texts in the interface do not change.
 */
function toLegacyError(error: unknown): Error {
  if (error instanceof DomainError) {
    return new Error(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** Unwraps a Result, or throws the legacy error. */
function value<T>(result: Result<T>): T {
  if (!result.ok) throw toLegacyError(result.error);
  return result.value;
}

/**
 * @deprecated Temporary facade: use the use cases directly. Kept for the WhatsApp bot and the
 * admin module, which are migrated in later specs.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly createBookingUseCase: CreateBookingUseCase,
    private readonly listBookingsUseCase: ListBookingsUseCase,
    private readonly getBookingUseCase: GetBookingUseCase,
    private readonly updateBookingUseCase: UpdateBookingUseCase,
    private readonly deleteBookingUseCase: DeleteBookingUseCase,
    private readonly getCancellationUseCase: GetCancellationUseCase,
    private readonly cancelBookingUseCase: CancelBookingByTokenUseCase,
    private readonly checkSlotUseCase: CheckSlotUseCase,
    private readonly getStatisticsUseCase: GetStatisticsUseCase,
  ) {}

  async create(request: unknown): Promise<
    Record<string, unknown> & {
      cancelToken: string;
    }
  > {
    const created = value(
      await this.createBookingUseCase.execute(request as never),
    );
    return {
      ...(created.booking as unknown as Record<string, unknown>),
      cancelToken: created.cancelToken,
    };
  }

  async findAll(): Promise<Booking[]> {
    return value(await this.listBookingsUseCase.execute());
  }

  async findOne(id: string): Promise<Booking | null> {
    return value(await this.getBookingUseCase.execute(id));
  }

  async update(id: string, request: unknown): Promise<Booking | null> {
    return value(await this.updateBookingUseCase.execute(id, request as never));
  }

  async remove(id: string): Promise<Booking | null> {
    return value(await this.deleteBookingUseCase.execute(id));
  }

  async getCancellation(token: string): Promise<CancellationSummary> {
    return value(await this.getCancellationUseCase.execute(token));
  }

  async cancelByToken(token: string): Promise<CancellationSummary> {
    return value(await this.cancelBookingUseCase.execute(token));
  }

  async checkAvailability(
    date: string,
    time: string,
    professionalId: string,
    serviceIds: string[],
    locationId?: string,
  ): Promise<{ available: boolean }> {
    return value(
      await this.checkSlotUseCase.execute({
        date,
        time,
        professionalId,
        serviceIds,
        locationId,
      }),
    );
  }

  async getStatistics(): Promise<BookingStatistics> {
    return value(await this.getStatisticsUseCase.execute());
  }
}
