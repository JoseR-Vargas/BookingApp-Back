import { PublicAvailabilitySettings } from '../../domain/public-availability';

/** Reads the settings of the public availability page (`/disponibilidad`). */
export interface PublicAvailabilityReader {
  /** The stored settings; the default (off) when none are stored. */
  read(): Promise<PublicAvailabilitySettings>;
}

export const PUBLIC_AVAILABILITY_READER = Symbol('PUBLIC_AVAILABILITY_READER');
