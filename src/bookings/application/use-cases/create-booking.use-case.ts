import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  STORAGE_GATE,
  StorageGate,
} from '../../../shared/application/storage-gate.port';
import { Result, err, ok } from '../../../shared/domain/result';
import { StorageLimitReached } from '../../../shared/domain/storage-limit.error';
import { BookingPlace, CreatedBooking } from '../../domain/booking';
import {
  BlockAlreadyTaken,
  InvalidBooking,
  TrialLimitReached,
} from '../../domain/booking.errors';
import {
  BookingRequest,
  requireBookingFields,
  serviceIdsOf,
} from '../../domain/booking.rules';
import { BOOKING_CATALOG, BookingCatalog } from '../ports/booking-catalog.port';
import {
  BOOKING_NOTIFIER,
  BookingNotifier,
} from '../ports/booking-notifier.port';
import { BOOKING_READER, BookingReader } from '../ports/booking.reader';
import { BOOKING_WRITER, BookingWriter } from '../ports/booking.writer';
import { CANCEL_TOKENS, CancelTokens } from '../ports/cancel-tokens.port';
import { TRIAL_GATE, TrialGate } from '../ports/trial-gate.port';
import { resolveSchedule } from './resolve-schedule';

export interface CreateBookingInput extends BookingRequest {
  client?: {
    name?: string;
    id?: string;
    email?: string;
    phone?: string;
  } | null;
  services?: { id?: string }[] | null;
  professional?: { id?: string; name?: string } | null;
  /** Only `id` is trusted; the name comes from the catalog. */
  location?: { id?: unknown } | null;
  notes?: string;
}

/**
 * Creates a confirmed booking. Everything but the client data is derived from
 * the catalog; the cancel token is returned once and only its hash is stored.
 * A business whose free trial is over answers `TrialLimitReached` first, and
 * one over its storage quota answers `StorageLimitReached` (spec 22).
 * Duplicates per client are NOT checked: a client may book with different
 * professionals at the same time.
 */
@Injectable()
export class CreateBookingUseCase {
  constructor(
    @Inject(BOOKING_CATALOG) private readonly catalog: BookingCatalog,
    @Inject(BOOKING_READER) private readonly reader: BookingReader,
    @Inject(BOOKING_WRITER) private readonly writer: BookingWriter,
    @Inject(CANCEL_TOKENS) private readonly tokens: CancelTokens,
    @Inject(BOOKING_NOTIFIER) private readonly notifier: BookingNotifier,
    @Inject(TRIAL_GATE) private readonly trial: TrialGate,
    @Optional()
    @Inject(STORAGE_GATE)
    private readonly storage?: StorageGate,
  ) {}

  async execute(input: CreateBookingInput): Promise<Result<CreatedBooking>> {
    // A business whose trial is over takes no new bookings (spec 21).
    if (!(await this.trial.allowsNewBookings())) {
      return err(new TrialLimitReached());
    }
    // ...nor does a business over its storage quota (spec 22).
    if (this.storage && !(await this.storage.allowsNewData())) {
      return err(new StorageLimitReached());
    }
    const required = requireBookingFields(input);
    if (!required.ok) return required;

    const location = await this.requestedLocation(input.location);
    if (!location.ok) return location;

    const resolved = await resolveSchedule(this.catalog, this.reader, {
      serviceIds: serviceIdsOf(input.services),
      professionalId: input.professional!.id!,
      date: input.date!,
      time: input.time!,
      location: location.value,
    });
    if (!resolved.ok) return resolved;

    const cancelToken = this.tokens.generate();
    const saved = await this.writer.create(
      {
        client: input.client as never,
        date: input.date!,
        time: input.time!,
        notes: input.notes,
        ...resolved.value,
        status: 'confirmed',
      },
      this.tokens.hash(cancelToken),
      new BlockAlreadyTaken(
        resolved.value.professional.name,
        input.date!,
        input.time!,
      ),
    );
    if (!saved.ok) return saved;

    await this.notifier.created(saved.value, cancelToken);
    return ok({ booking: saved.value, cancelToken });
  }

  /**
   * The location a new booking is made at. A given id must be an active
   * location; without one the default location is used only while a single
   * location is active.
   */
  private async requestedLocation(
    requested: { id?: unknown } | undefined | null,
  ): Promise<Result<BookingPlace>> {
    if (requested?.id !== undefined && requested?.id !== null) {
      return this.catalog.getLocation(
        typeof requested.id === 'string' ? requested.id : '',
      );
    }
    const active = await this.catalog.getActiveLocations();
    if (active.length > 1) {
      return err(new InvalidBooking('debes elegir un local'));
    }
    return this.catalog.getLocation();
  }
}
