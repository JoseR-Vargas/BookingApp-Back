import type { WeeklySchedule } from '../../shared/domain/schedule/schedule';

/** A service as the availability answers show it. */
export interface OfferedService {
  id: string;
  name: string;
  duration: number;
}

/** A service the public page may publish (same shape as an offered one). */
export type PublishedService = OfferedService;

export interface OfferedProfessional {
  id: string;
  name: string;
}

/** The services of the query and the professionals that offer ALL of them. */
export interface ServiceSelection {
  /** In the order the client picked them. */
  services: OfferedService[];
  professionals: OfferedProfessional[];
  /** Minutes of all the services back to back. */
  totalDuration: number;
}

export interface LocationSummary {
  id: string;
  name: string;
}

/** A location with the schedule its days are computed from. */
export interface AvailabilityLocation extends LocationSummary {
  schedule: WeeklySchedule;
}

/** The slots a (non-cancelled) booking blocks, for one professional. */
export interface OccupiedBooking {
  professionalId: string;
  /** Slot start times ('HH:MM') the booking occupies. */
  slots: string[];
}

export interface ProfessionalAvailability {
  id: string;
  name: string;
  slots: string[];
}

export interface Availability {
  date: string;
  closed: boolean;
  services: OfferedService[];
  totalDuration: number;
  professionals: ProfessionalAvailability[];
}

/** The day plus the location it was computed for. */
export type LocatedAvailability = Availability & { location: LocationSummary };

/** The settings of the public availability page. `serviceIds: null` = every service. */
export interface PublicSettings {
  enabled: boolean;
  days: number;
  serviceIds: string[] | null;
}

export interface PublicAvailabilityDay {
  date: string;
  closed: boolean;
  times: { time: string; professionals: { id: string; name: string }[] }[];
}

export type PublicAvailability =
  | { enabled: false }
  | {
      enabled: true;
      services: PublishedService[];
      serviceId: string | null;
      /** The location the days were computed for. */
      locationId: string;
      /** Active locations, so the page can offer a selector. */
      locations: LocationSummary[];
      days: PublicAvailabilityDay[];
    };
