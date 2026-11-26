/**
 * The Mongoose entity of a booking now lives in
 * `infrastructure/persistence/mongo/booking.entity.ts` (spec 14). This file
 * only re-exports it for the modules that are not migrated yet (`email`,
 * `admin`) and their specs.
 *
 * @deprecated TEMPORARY re-export, deleted when `email` (spec 17) and `admin`
 * import the entity or the domain model from their new home.
 */
export {
  BOOKING_STATUSES,
  Booking,
  BookingSchema,
} from '../infrastructure/persistence/mongo/booking.entity';
export type {
  BookedService,
  BookingStatus,
} from '../infrastructure/persistence/mongo/booking.entity';
