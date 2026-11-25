import { Booking as BookingRecord } from './booking.entity';
import { Booking, NewBooking } from '../../../domain/booking';

type Plain = Record<string, any>;

/** A stored document (or a lean object) as a plain object. */
const plainOf = (record: BookingRecord | Plain): Plain =>
  typeof (record as BookingRecord).toObject === 'function'
    ? (record as BookingRecord).toObject()
    : { ...record };

const keyOf = (value: unknown): string | undefined =>
  value === undefined || value === null
    ? undefined
    : String(value as string | number | boolean);

/**
 * A stored booking as a domain booking. The cancel-token hash is dropped here
 * (a saved document carries it even though queries hide it), and the store's
 * own bookkeeping (revision counter, ids of the embedded client and
 * professional) goes to `storage`, so the JSON the admin panel gets is the
 * one it always got.
 */
export function toDomain(record: BookingRecord | Plain): Booking {
  const plain = plainOf(record);
  const { _id: clientKey, ...client } = plain.client ?? {};
  const { _id: professionalKey, ...professional } = plain.professional ?? {};
  return {
    id: String(plain._id),
    client: plain.client ? (client as Booking['client']) : plain.client,
    services: plain.services,
    totalPrice: plain.totalPrice,
    totalDuration: plain.totalDuration,
    professional: plain.professional
      ? (professional as Booking['professional'])
      : plain.professional,
    location: plain.location,
    date: plain.date,
    time: plain.time,
    slots: plain.slots,
    notes: plain.notes,
    status: plain.status,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    storage: {
      version: plain.__v,
      clientKey: keyOf(clientKey),
      professionalKey: keyOf(professionalKey),
    },
  };
}

/** The document to store for a new booking, with the hash of its cancel token. */
export function toRecord(booking: NewBooking, cancelTokenHash: string): Plain {
  return {
    client: booking.client,
    date: booking.date,
    time: booking.time,
    notes: booking.notes,
    services: booking.services,
    totalPrice: booking.totalPrice,
    totalDuration: booking.totalDuration,
    professional: booking.professional,
    location: booking.location,
    slots: booking.slots,
    status: booking.status,
    cancelTokenHash,
  };
}
