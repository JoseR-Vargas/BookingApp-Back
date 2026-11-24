import { ListScope } from '../../../application/ports/list-scope';
import { ProfessionalPhotoStore } from '../../../application/ports/professional-photo.store';
import { ProfessionalReader } from '../../../application/ports/professional.reader';
import { ProfessionalWriter } from '../../../application/ports/professional.writer';
import { SeedProfessionalDocument } from '../../../application/ports/professional-repository.contract';
import {
  NewProfessional,
  Professional,
  ProfessionalPatch,
  StoredPhoto,
} from '../../../domain/professional';

interface Row {
  id: string;
  name: string;
  specialty: string;
  experience: string;
  rating: number;
  avatar: string;
  active: boolean;
  photo: StoredPhoto | null;
  locationIds: string[] | null;
}

const copyPhoto = (photo: StoredPhoto): StoredPhoto => ({
  mimeType: photo.mimeType,
  data: Buffer.from(photo.data),
  updatedAt: new Date(photo.updatedAt),
});

const toProfessional = (row: Row): Professional => ({
  id: row.id,
  name: row.name,
  specialty: row.specialty,
  experience: row.experience,
  rating: row.rating,
  avatar: row.avatar,
  active: row.active,
  photo: row.photo
    ? {
        mimeType: row.photo.mimeType,
        updatedAt: new Date(row.photo.updatedAt),
      }
    : null,
  locationIds: row.locationIds ? [...row.locationIds] : null,
});

/**
 * Keeps the professionals (and their photos) in memory, in creation order.
 * It honors the same port contract as the MongoDB adapter; use-case and HTTP
 * tests run on it.
 */
export class InMemoryProfessionalRepository
  implements ProfessionalReader, ProfessionalWriter, ProfessionalPhotoStore
{
  private rows: Row[] = [];

  /** Puts a professional in the store as given, bypassing the port. */
  seed(document: SeedProfessionalDocument): void {
    this.rows.push({
      id: document.id,
      name: document.name,
      specialty: document.specialty ?? '',
      experience: document.experience ?? '',
      rating: document.rating ?? 5,
      avatar: document.avatar ?? 'fas fa-user',
      active: document.active ?? true,
      photo: document.photo ? copyPhoto(document.photo) : null,
      locationIds: document.locationIds ? [...document.locationIds] : null,
    });
  }

  get count(): number {
    return this.rows.length;
  }

  list(scope: ListScope): Promise<Professional[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => scope === 'all' || row.active)
        .map(toProfessional),
    );
  }

  find(id: string): Promise<Professional | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    return Promise.resolve(row ? toProfessional(row) : null);
  }

  findActive(id: string): Promise<Professional | null> {
    const row = this.rows.find(
      (candidate) => candidate.id === id && candidate.active,
    );
    return Promise.resolve(row ? toProfessional(row) : null);
  }

  existingIds(ids: string[]): Promise<string[]> {
    return Promise.resolve(
      this.rows.map((row) => row.id).filter((id) => ids.includes(id)),
    );
  }

  async insert(
    candidates: AsyncIterable<string>,
    draft: NewProfessional,
  ): Promise<Professional> {
    for await (const id of candidates) {
      // Checking and pushing happen in one synchronous step: atomic.
      if (this.rows.some((row) => row.id === id)) continue;
      const row: Row = {
        id,
        name: draft.name,
        specialty: draft.specialty,
        experience: draft.experience,
        rating: draft.rating,
        avatar: draft.avatar,
        active: draft.active,
        photo: draft.photo ? copyPhoto(draft.photo) : null,
        locationIds: [...draft.locationIds],
      };
      this.rows.push(row);
      return toProfessional(row);
    }
    throw new Error('The candidates ended before one was free');
  }

  update(id: string, patch: ProfessionalPatch): Promise<Professional | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) return Promise.resolve(null);
    const { locationIds, ...fields } = patch;
    Object.assign(row, fields);
    if (locationIds) row.locationIds = [...locationIds];
    return Promise.resolve(toProfessional(row));
  }

  delete(id: string): Promise<void> {
    this.rows = this.rows.filter((row) => row.id !== id);
    return Promise.resolve();
  }

  findPhoto(id: string): Promise<StoredPhoto | null> {
    const photo = this.rows.find((row) => row.id === id)?.photo;
    return Promise.resolve(photo ? copyPhoto(photo) : null);
  }

  savePhoto(id: string, photo: StoredPhoto): Promise<Professional | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) return Promise.resolve(null);
    row.photo = copyPhoto(photo);
    return Promise.resolve(toProfessional(row));
  }

  removePhoto(id: string): Promise<Professional | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) return Promise.resolve(null);
    row.photo = null;
    return Promise.resolve(toProfessional(row));
  }
}
