/**
 * Test-only doubles for the booking use cases: a catalog with a few services,
 * professionals and locations, a notifier that records, deterministic cancel
 * tokens and a clock that answers a given moment.
 */
import { BusinessClock } from '../availability/application/ports/business-clock.port';
import { SEED_SCHEDULE } from '../catalog/domain/seed-schedule';
import { CLOCK, Clock } from '../shared/application/clock.port';
import { err, ok } from '../shared/domain/result';
import { WeeklySchedule } from '../shared/domain/schedule/schedule';
import {
  BookingCatalog,
  CatalogProfessional,
} from './application/ports/booking-catalog.port';
import { BookingNotifier } from './application/ports/booking-notifier.port';
import { CancelTokens } from './application/ports/cancel-tokens.port';
import { Booking, BookingPlace } from './domain/booking';
import { InvalidBooking } from './domain/booking.errors';
import { SelectedService } from './domain/booking.rules';
import { InMemoryBookingRepository } from './infrastructure/persistence/in-memory/in-memory-booking.repository';
import { InMemoryBookingStatistics } from './infrastructure/persistence/in-memory/in-memory-booking-statistics';
import { CreateBookingUseCase } from './application/use-cases/create-booking.use-case';
import { UpdateBookingUseCase } from './application/use-cases/update-booking.use-case';
import { ListBookingsUseCase } from './application/use-cases/list-bookings.use-case';
import { GetBookingUseCase } from './application/use-cases/get-booking.use-case';
import { DeleteBookingUseCase } from './application/use-cases/delete-booking.use-case';
import { GetCancellationUseCase } from './application/use-cases/get-cancellation.use-case';
import { CancelBookingByTokenUseCase } from './application/use-cases/cancel-booking-by-token.use-case';
import { CheckSlotUseCase } from './application/use-cases/check-slot.use-case';
import { GetStatisticsUseCase } from './application/use-cases/get-statistics.use-case';

export const SERVICES: SelectedService[] = [
  {
    id: 'corte',
    name: 'Corte',
    price: 1200,
    duration: 60,
    professionals: ['alex', 'maria'],
  },
  {
    id: 'tinte',
    name: 'Tinte',
    price: 2500,
    duration: 90,
    professionals: ['alex', 'maria'],
  },
  {
    id: 'exclusivo',
    name: 'Exclusivo',
    price: 3000,
    duration: 60,
    professionals: ['alex'],
  },
];

export const PROFESSIONALS: CatalogProfessional[] = [
  { id: 'alex', name: 'Alex García' },
  { id: 'maria', name: 'María López' },
];

export const PRINCIPAL: BookingPlace = { id: 'principal', name: 'Principal' };
export const CENTRO: BookingPlace = { id: 'centro', name: 'Centro' };

/** A catalog that answers the way the real one does, over fixed data. */
export class FakeBookingCatalog implements BookingCatalog {
  /** Active locations, oldest first. */
  locations: BookingPlace[] = [PRINCIPAL];
  /** Where each professional works (default: only at the principal). */
  worksAt: Record<string, string[]> = {
    alex: ['principal', 'centro'],
    maria: ['principal'],
  };
  schedule: WeeklySchedule = SEED_SCHEDULE;
  /** Number of calls per method, to assert what a use case did not ask. */
  calls: Record<string, number> = {};

  private count(method: string): void {
    this.calls[method] = (this.calls[method] ?? 0) + 1;
  }

  getLocation(locationId?: string) {
    this.count('getLocation');
    const found =
      locationId === undefined
        ? this.locations[0]
        : this.locations.find(({ id }) => id === locationId);
    return Promise.resolve(
      found
        ? ok(found)
        : err(new InvalidBooking('el local seleccionado no existe')),
    );
  }

  getActiveLocations() {
    this.count('getActiveLocations');
    return Promise.resolve([...this.locations]);
  }

  getSchedule(locationId: string) {
    this.count('getSchedule');
    return Promise.resolve(
      this.locations.some(({ id }) => id === locationId)
        ? ok(this.schedule)
        : err(new InvalidBooking('el local seleccionado no existe')),
    );
  }

  resolveServices(serviceIds: string[]) {
    this.count('resolveServices');
    if (serviceIds.length === 0) {
      return Promise.resolve(
        err(new InvalidBooking('debes seleccionar al menos un servicio')),
      );
    }
    const seen = new Set<string>();
    const services: SelectedService[] = [];
    for (const id of serviceIds) {
      if (seen.has(id)) {
        return Promise.resolve(
          err(new InvalidBooking(`el servicio ${id} está repetido`)),
        );
      }
      seen.add(id);
      const service = SERVICES.find((candidate) => candidate.id === id);
      if (!service) {
        return Promise.resolve(
          err(new InvalidBooking(`el servicio ${id} no existe`)),
        );
      }
      services.push(service);
    }
    return Promise.resolve(
      ok({
        services,
        totalPrice: services.reduce((sum, { price }) => sum + price, 0),
        totalDuration: services.reduce(
          (sum, { duration }) => sum + duration,
          0,
        ),
        professionals: PROFESSIONALS.filter(({ id }) =>
          services.every((service) => service.professionals.includes(id)),
        ).map(({ id }) => id),
      }),
    );
  }

  findProfessional(id: string) {
    this.count('findProfessional');
    return Promise.resolve(
      PROFESSIONALS.find((professional) => professional.id === id) ?? null,
    );
  }

  worksAtLocation(professionalId: string, locationId: string) {
    this.count('worksAtLocation');
    return Promise.resolve(
      (this.worksAt[professionalId] ?? []).includes(locationId),
    );
  }
}

/** Records what was announced, or fails like a notification that cannot reach anyone. */
export class RecordingNotifier implements BookingNotifier {
  created_: { booking: Booking; cancelToken: string }[] = [];
  cancelled_: Booking[] = [];

  created(booking: Booking, cancelToken: string): Promise<void> {
    this.created_.push({ booking, cancelToken });
    return Promise.resolve();
  }

  cancelled(booking: Booking): Promise<void> {
    this.cancelled_.push(booking);
    return Promise.resolve();
  }
}

/** Tokens `token-1`, `token-2`...; the hash of a token is `hash:<token>`. */
export class SequentialTokens implements CancelTokens {
  private counter = 0;

  generate(): string {
    return `${'t'.repeat(37)}${String(++this.counter).padStart(6, '0')}`;
  }

  hash(token: string): string {
    return `hash:${token}`;
  }
}

export const fixedClock = (instant: string): Clock => ({
  now: () => new Date(instant),
});

/** A business clock that answers `today` and `time` ('HH:MM'; null: timezone unknown). */
export const businessClock = (
  today: string,
  time: string | null,
  seconds = 0,
): BusinessClock => ({ now: () => ({ today, time, seconds }) });

export { CLOCK };

/** All the use cases over in-memory adapters and the doubles above. */
export function buildBookings(
  options: { clock?: BusinessClock; now?: string } = {},
) {
  const repository = new InMemoryBookingRepository();
  const statistics = new InMemoryBookingStatistics(repository);
  const catalog = new FakeBookingCatalog();
  const notifier = new RecordingNotifier();
  const tokens = new SequentialTokens();
  const clock = options.clock ?? businessClock('2026-03-20', '09:00');
  const now = fixedClock(options.now ?? '2026-03-20T12:00:00Z');
  return {
    repository,
    catalog,
    notifier,
    tokens,
    create: new CreateBookingUseCase(
      catalog,
      repository,
      repository,
      tokens,
      notifier,
    ),
    update: new UpdateBookingUseCase(catalog, repository, repository),
    list: new ListBookingsUseCase(repository),
    get: new GetBookingUseCase(repository),
    remove: new DeleteBookingUseCase(repository),
    getCancellation: new GetCancellationUseCase(repository, tokens, clock),
    cancel: new CancelBookingByTokenUseCase(
      repository,
      repository,
      tokens,
      clock,
      notifier,
    ),
    checkSlot: new CheckSlotUseCase(catalog, repository),
    statistics: new GetStatisticsUseCase(statistics, now),
  };
}
