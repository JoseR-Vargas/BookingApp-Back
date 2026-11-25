export const BOOKING_STATUSES = ['confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** A service as priced when it was booked. */
export interface BookedService {
  id: string;
  name: string;
  price: number;
  duration: number;
}

export interface BookingClient {
  name: string;
  /** The client's own id, when the client has one. */
  id?: string;
  /** Optional: WhatsApp bookings only provide a phone number. */
  email?: string;
  phone: string;
}

export interface BookingPlace {
  id: string;
  name: string;
}

/**
 * Bookkeeping of the store that the admin panel receives today (the revision
 * counter and the keys of the embedded client and professional). Business
 * rules never read it; the persistence mapper fills it and the presenter
 * gives it back, so the JSON of a booking does not change.
 */
export interface BookingStorageMeta {
  version?: number;
  clientKey?: string;
  professionalKey?: string;
}

/** A booking without its cancel-token hash: the hash never leaves the store. */
export interface Booking {
  id: string;
  client: BookingClient;
  /** Services performed back-to-back, in order. */
  services: BookedService[];
  totalPrice: number;
  /** Sum of the service durations, in minutes. */
  totalDuration: number;
  professional: { id: string; name: string };
  /** Absent on bookings made before locations existed: they belong to the default location. */
  location?: BookingPlace;
  date: string;
  time: string;
  /** Slot start times ('HH:MM') the booking occupies. */
  slots: string[];
  notes: string;
  status: BookingStatus;
  createdAt?: Date;
  updatedAt?: Date;
  storage?: BookingStorageMeta;
}

/** A booking ready to be stored (the store gives it an id and its timestamps). */
export type NewBooking = Omit<
  Booking,
  'id' | 'notes' | 'createdAt' | 'updatedAt' | 'storage'
> & { notes?: string };

/**
 * Fields an update may change, as the admin sent them (derived fields
 * already removed), plus the ones resolved from the catalog.
 */
export type BookingChanges = Record<string, unknown>;

/** A booking as it leaves `create`: the booking plus its one-time cancel token. */
export interface CreatedBooking {
  booking: Booking;
  cancelToken: string;
}

export interface BookingStatistics {
  totalBookings: number;
  totalRevenue: number;
  todayBookings: number;
}
