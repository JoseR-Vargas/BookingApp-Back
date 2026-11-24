import { toBuffer } from '../../../../shared/infrastructure/mongo/to-buffer';
import {
  NewProfessional,
  Professional,
  ProfessionalPatch,
  StoredPhoto,
} from '../../../domain/professional';
import { ProfessionalRecord } from './professional.entity';

/** Entity -> domain. The photo bytes are never part of a `Professional`. */
export function toProfessional(record: ProfessionalRecord): Professional {
  return {
    id: record.id,
    name: record.name,
    specialty: record.specialty,
    experience: record.experience,
    rating: record.rating,
    avatar: record.avatar,
    active: record.active,
    photo: record.photo
      ? {
          mimeType: record.photo.mimeType,
          updatedAt: new Date(record.photo.updatedAt),
        }
      : null,
    locationIds: record.locationIds ? [...record.locationIds] : null,
  };
}

/** Entity -> the photo with its bytes; null without photo. */
export function toStoredPhoto(record: ProfessionalRecord): StoredPhoto | null {
  const photo = record.photo;
  return photo
    ? {
        mimeType: photo.mimeType,
        data: toBuffer(photo.data),
        updatedAt: new Date(photo.updatedAt),
      }
    : null;
}

/** The photo as the document stores it. */
export const toPhotoRecord = (photo: StoredPhoto) => ({
  mimeType: photo.mimeType,
  data: photo.data,
  updatedAt: photo.updatedAt,
});

/** Domain -> the fields of a new document (everything but the id). */
export function toNewRecord(draft: NewProfessional) {
  return {
    name: draft.name,
    specialty: draft.specialty,
    experience: draft.experience,
    active: draft.active,
    rating: draft.rating,
    avatar: draft.avatar,
    locationIds: draft.locationIds,
    photo: draft.photo ? toPhotoRecord(draft.photo) : null,
  };
}

/** The `$set` of an edit: only the fields it carries. */
export function toSetFields(patch: ProfessionalPatch): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
}
