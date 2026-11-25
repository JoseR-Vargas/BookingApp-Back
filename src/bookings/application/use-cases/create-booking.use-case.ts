import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../shared/domain/result';
import { BookingPlace, CreatedBooking } from '../../domain/booking';
import { BlockAlreadyTaken, InvalidBooking } from '../../domain/booking.errors';
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
  ) {}

  async execute(input: CreateBookingInput): Promise<Result<CreatedBooking>> {
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
