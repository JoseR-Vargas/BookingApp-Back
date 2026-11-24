export type PhotoMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

/** What a professional knows about its photo; the bytes live in the photo store. */
export interface ProfessionalPhoto {
  mimeType: PhotoMimeType;
  updatedAt: Date;
}

/** A photo with its bytes, as stored and served. */
export interface StoredPhoto extends ProfessionalPhoto {
  data: Buffer;
}

/** A validated image, before it is stamped with a time and stored. */
export interface PhotoUpload {
  mimeType: PhotoMimeType;
  data: Buffer;
}

export interface Professional {
  id: string;
  name: string;
  specialty: string;
  experience: string;
  rating: number;
  avatar: string;
  active: boolean;
  photo: ProfessionalPhoto | null;
  /** Stored location ids; null = documents stored before locations existed (the default location). */
  locationIds: string[] | null;
}

/** A professional whose locations are known (the stored ones, or the default). */
export type LocatedProfessional = Professional & { locationIds: string[] };

/** Everything a new professional is stored with, but its id. */
export interface NewProfessional {
  name: string;
  specialty: string;
  experience: string;
  active: boolean;
  rating: number;
  avatar: string;
  locationIds: string[];
  photo: StoredPhoto | null;
}

/** A default professional of the seed: stored as is, without photo nor locations. */
export interface SeedProfessional {
  id: string;
  name: string;
  specialty: string;
  experience: string;
  rating: number;
  avatar: string;
  active: boolean;
}

/** The fields an edit may change (the photo has its own port). */
export interface ProfessionalPatch {
  name?: string;
  specialty?: string;
  experience?: string;
  active?: boolean;
  locationIds?: string[];
}
