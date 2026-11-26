import { Result, err, ok } from '../../../shared/domain/result';
import { BookedService, BookingPlace } from '../../domain/booking';
import {
  checkBlocksFree,
  checkDate,
  checkProfessional,
  checkWorksAtLocation,
  resolveWindow,
  toBookedService,
} from '../../domain/booking.rules';
import { occupiedSlots } from '../../../availability/domain/occupancy.rules';
import { BookingCatalog } from '../ports/booking-catalog.port';
import { BookingReader } from '../ports/booking.reader';

export interface ScheduleRequest {
  serviceIds: string[];
  professionalId: string;
  date: string;
  time: string;
  /** The location the booking happens at, already resolved. */
  location: BookingPlace;
}

/** Booking fields derived from the catalog; never trusted from the client. */
export interface ResolvedSchedule {
  services: BookedService[];
  totalPrice: number;
  totalDuration: number;
  professional: { id: string; name: string };
  location: BookingPlace;
  slots: string[];
}

/**
 * Validates services, professional and start time against the catalog and the
 * existing bookings, returning the catalog values and the blocks the booking
 * takes. The first failure wins, in this order: services, professional, the
 * professional at the location, the date, the start time, the occupied blocks.
 * `excludeId` is the booking being edited, which never blocks itself.
 */
export async function resolveSchedule(
  catalog: BookingCatalog,
  bookings: BookingReader,
  request: ScheduleRequest,
  excludeId?: string,
): Promise<Result<ResolvedSchedule>> {
  const selection = await catalog.resolveServices(request.serviceIds);
  if (!selection.ok) return selection;

  const found = checkProfessional(
    await catalog.findProfessional(request.professionalId),
    selection.value,
  );
  if (!found.ok) return found;
  const professional = found.value;

  const works = checkWorksAtLocation(
    await catalog.worksAtLocation(professional.id, request.location.id),
    professional.name,
    request.location,
  );
  if (!works.ok) return works;

  const validDate = checkDate(request.date);
  if (!validDate.ok) return validDate;
  const schedule = await catalog.getSchedule(request.location.id);
  if (!schedule.ok) return schedule;
  const window = resolveWindow(
    request.date,
    request.time,
    selection.value.services,
    selection.value.totalDuration,
    schedule.value,
  );
  if (!window.ok) return window;

  const occupied = occupiedSlots(
    await bookings.findOccupiedSlots(request.date, professional.id, excludeId),
  );
  const free = checkBlocksFree(
    window.value,
    occupied,
    professional.name,
    request.date,
    request.time,
  );
  if (!free.ok) return err(free.error);

  return ok({
    services: selection.value.services.map(toBookedService),
    totalPrice: selection.value.totalPrice,
    totalDuration: selection.value.totalDuration,
    professional: { id: professional.id, name: professional.name },
    location: request.location,
    slots: window.value,
  });
}
