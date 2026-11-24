import { Professional, StoredPhoto } from '../../domain/professional';

/** Reads, stores and removes the photo (with its bytes) of a professional. */
export interface ProfessionalPhotoStore {
  /** The photo of a professional, active or not; null without photo or professional. */
  findPhoto(professionalId: string): Promise<StoredPhoto | null>;
  /** Replaces the photo; answers the professional, or null when it does not exist. */
  savePhoto(
    professionalId: string,
    photo: StoredPhoto,
  ): Promise<Professional | null>;
  /** Removes the photo; answers the professional, or null when it does not exist. */
  removePhoto(professionalId: string): Promise<Professional | null>;
}

export const PROFESSIONAL_PHOTO_STORE = Symbol('PROFESSIONAL_PHOTO_STORE');
