// ===== PRESENTADOR DE RESERVAS =====
// The JSON the admin panel and the public pages have always received. The domain booking carries
// the store's bookkeeping in `storage`, so the presenter can rebuild the document shape without
// the persistence layer leaking into the response.

import { Booking } from '../../domain/booking';

type Json = Record<string, unknown>;

const withKey = (value: Json, key?: string): Json =>
  key === undefined ? value : { ...value, _id: key };

/**
 * A booking as the API has always returned it: the same fields, with the id as `_id` and the
 * embedded ids of the client and the professional, plus the revision counter as `__v`.
 */
export function toBookingJson(booking: Booking): Json {
  return {
    _id: booking.id,
    client: withKey({ ...booking.client }, booking.storage?.clientKey),
    services: booking.services,
    totalPrice: booking.totalPrice,
    totalDuration: booking.totalDuration,
    professional: withKey(
      { ...booking.professional },
      booking.storage?.professionalKey,
    ),
    location: booking.location,
    date: booking.date,
    time: booking.time,
    slots: booking.slots,
    notes: booking.notes,
    status: booking.status,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
    __v: booking.storage?.version,
  };
}

/** The created booking: the stored one plus the one-time cancel token. */
export function toCreatedBookingJson(
  booking: Booking,
  cancelToken: string,
): Json {
  return { ...toBookingJson(booking), cancelToken };
}
