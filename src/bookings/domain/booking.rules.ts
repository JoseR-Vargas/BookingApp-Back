import { Result, err, ok } from '../../shared/domain/result';
import type { WeeklySchedule } from '../../shared/domain/schedule/schedule';
import {
  buildDaySlots,
  dayOfWeekFromIsoDate,
  offeredStarts,
  slotsRequired,
} from '../../shared/domain/schedule/schedule.rules';
import { windowSlots } from '../../availability/domain/occupancy.rules';
import {
  BookedService,
  Booking,
  BookingChanges,
  BookingPlace,
  BookingStatus,
} from './booking';
import {
  BlockAlreadyTaken,
  InvalidBooking,
  MissingBookingData,
} from './booking.errors';

/** What the client sends to book; nothing here is trusted beyond the ids. */
export interface BookingRequest {
  client?: { name?: string; phone?: string } | null;
  professional?: { id?: string } | null;
  date?: string;
  time?: string;
}

/** The first missing required field, in the order the client is told about them. */
export function requireBookingFields(
  request: BookingRequest,
): Result<void, MissingBookingData> {
  if (!request.date || !request.time) {
    return err(new MissingBookingData('Fecha y hora son requeridas'));
  }
  if (!request.professional?.id) {
    return err(new MissingBookingData('Profesional es requerido'));
  }
  if (!request.client?.name || !request.client?.phone) {
    return err(new MissingBookingData('Datos del cliente son requeridos'));
  }
  return ok(undefined);
}

/** The ids of a list of services as the client sent it; anything else is an empty list. */
export const serviceIdsOf = (
  services: { id?: string }[] | null | undefined,
): string[] =>
  Array.isArray(services) ? services.map((service) => service?.id ?? '') : [];

/** The services of a validated selection, as they are stored in a booking. */
export interface SelectedService extends BookedService {
  /** Ids of the professionals that offer the service. */
  professionals: string[];
}

export interface SelectedServices {
  services: SelectedService[];
  totalPrice: number;
  totalDuration: number;
}

export const toBookedService = (service: SelectedService): BookedService => ({
  id: service.id,
  name: service.name,
  price: service.price,
  duration: service.duration,
});

/** The professional must exist and offer every selected service. */
export function checkProfessional<P extends { id: string; name: string }>(
  professional: P | null,
  selection: SelectedServices,
): Result<P, InvalidBooking> {
  if (!professional) {
    return err(new InvalidBooking('el profesional seleccionado no existe'));
  }
  const notOffered = selection.services.filter(
    (service) => !service.professionals.includes(professional.id),
  );
  if (notOffered.length > 0) {
    return err(
      new InvalidBooking(
        `${professional.name} no ofrece ${notOffered
          .map((service) => service.name)
          .join(', ')}`,
      ),
    );
  }
  return ok(professional);
}

export function checkWorksAtLocation(
  works: boolean,
  professionalName: string,
  location: BookingPlace,
): Result<void, InvalidBooking> {
  return works
    ? ok(undefined)
    : err(
        new InvalidBooking(
          `${professionalName} no trabaja en ${location.name}`,
        ),
      );
}

/** The date must be a real calendar date. */
export function checkDate(date: string): Result<void, InvalidBooking> {
  return dayOfWeekFromIsoDate(date) === null
    ? err(new InvalidBooking(`la fecha ${date} no es válida`))
    : ok(undefined);
}

/**
 * Consecutive slots a block of `totalDuration` minutes needs when it starts at
 * `time` (the schedule of its location decides the offered starts), or null.
 */
export function windowSlotsFor(
  date: string,
  time: string,
  totalDuration: number,
  schedule: WeeklySchedule,
): string[] | null {
  const dayOfWeek = dayOfWeekFromIsoDate(date);
  if (dayOfWeek === null) {
    return null;
  }
  if (!offeredStarts(dayOfWeek, schedule).includes(time)) {
    return null;
  }
  const interval = schedule.slotIntervalMinutes;
  return windowSlots(
    buildDaySlots(dayOfWeek, schedule),
    time,
    slotsRequired(totalDuration, interval),
    interval,
  );
}

/** The slots of the whole service block, which must fit in the day schedule. */
export function resolveWindow(
  date: string,
  time: string,
  services: { name: string }[],
  totalDuration: number,
  schedule: WeeklySchedule,
): Result<string[], InvalidBooking> {
  const slots = windowSlotsFor(date, time, totalDuration, schedule);
  if (!slots) {
    const names = services.map((service) => service.name).join(', ');
    return err(
      new InvalidBooking(
        `el horario ${time} no está disponible para ${names} el ${date}`,
      ),
    );
  }
  return ok(slots);
}

/** No slot of the block may be blocked already. */
export function checkBlocksFree(
  slots: string[],
  occupied: Set<string>,
  professionalName: string,
  date: string,
  time: string,
): Result<void, BlockAlreadyTaken> {
  return slots.some((slot) => occupied.has(slot))
    ? err(new BlockAlreadyTaken(professionalName, date, time))
    : ok(undefined);
}

/** Fields computed by the server; a client can never set them directly. */
const DERIVED_FIELDS = [
  'services',
  'professional',
  'location',
  'slots',
  'totalPrice',
  'totalDuration',
  'cancelTokenHash',
] as const;

const CANCELLED: BookingStatus = 'cancelled';

export interface UpdateRequest {
  services?: { id?: string }[] | null;
  professional?: { id?: string } | null;
  date?: string;
  time?: string;
  status?: string;
  [field: string]: unknown;
}

/** What an update changes and whether the catalog must validate the new schedule. */
export interface UpdatePlan {
  /** The fields to store as sent, without the derived ones. */
  changes: BookingChanges;
  target: {
    serviceIds: string[];
    professionalId: string | undefined;
    date: string;
    time: string;
    status: string;
  };
  /** The schedule changed, or a cancelled booking comes back: the block must be resolved again. */
  resolveSchedule: boolean;
}

/**
 * Services, professional, slots and totals only change through catalog
 * resolution: they are removed from what the admin sent, and the plan says
 * whether they must be resolved again.
 */
export function planUpdate(
  current: Booking,
  request: UpdateRequest,
): UpdatePlan {
  const changes: BookingChanges = { ...request };
  for (const field of DERIVED_FIELDS) {
    delete changes[field];
  }

  const currentServiceIds = serviceIdsOf(current.services);
  const target = {
    serviceIds: request.services
      ? serviceIdsOf(request.services)
      : currentServiceIds,
    professionalId: request.professional?.id ?? current.professional?.id,
    date: request.date ?? current.date,
    time: request.time ?? current.time,
    status: request.status ?? current.status,
  };
  const scheduleChanged =
    target.date !== current.date ||
    target.time !== current.time ||
    target.serviceIds.join() !== currentServiceIds.join() ||
    target.professionalId !== current.professional?.id;
  const reactivated =
    current.status === CANCELLED && target.status !== CANCELLED;

  return {
    changes,
    target,
    resolveSchedule:
      target.status !== CANCELLED && (scheduleChanged || reactivated),
  };
}
