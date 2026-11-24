/** Projection that keeps the photo bytes out of every professional query. */
export const WITHOUT_PHOTO_BYTES = '-photo.data';

/** Natural creation order: seeded defaults first, then admin additions. */
export const CREATION_ORDER = { _id: 1 } as const;
