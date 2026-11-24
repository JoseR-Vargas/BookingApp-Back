/**
 * What the public availability page (`/disponibilidad`) shows. `serviceIds: null`
 * publishes every active service.
 */
export interface PublicAvailabilitySettings {
  enabled: boolean;
  days: number;
  serviceIds: string[] | null;
}

/** Off until the admin turns it on; a store without settings reads as this. */
export const DEFAULT_PUBLIC_AVAILABILITY: PublicAvailabilitySettings = {
  enabled: false,
  days: 7,
  serviceIds: null,
};
