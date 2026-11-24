import { Professional } from '../../domain/professional';
import { ListScope } from './list-scope';

/** Reads professionals. Photo bytes are never loaded here (see ProfessionalPhotoStore). */
export interface ProfessionalReader {
  /** In creation order: the seeded defaults first, then the admin additions. */
  list(scope: ListScope): Promise<Professional[]>;
  /** A professional by id, active or not; null when there is none. */
  find(id: string): Promise<Professional | null>;
  /** An active professional by id; null when there is none or it is inactive. */
  findActive(id: string): Promise<Professional | null>;
  /** The ids, among `ids`, that belong to a professional (active or not). */
  existingIds(ids: string[]): Promise<string[]>;
}

export const PROFESSIONAL_READER = Symbol('PROFESSIONAL_READER');
