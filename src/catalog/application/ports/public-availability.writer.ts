import { PublicAvailabilitySettings } from '../../domain/public-availability';

export interface PublicAvailabilityWriter {
  /** Stores the settings, creating the document when needed; nothing else in it changes. */
  save(settings: PublicAvailabilitySettings): Promise<void>;
}

export const PUBLIC_AVAILABILITY_WRITER = Symbol('PUBLIC_AVAILABILITY_WRITER');
