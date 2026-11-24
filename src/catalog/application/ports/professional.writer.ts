import {
  NewProfessional,
  Professional,
  ProfessionalPatch,
} from '../../domain/professional';

export interface ProfessionalWriter {
  /**
   * Stores `draft` under the first of `candidates` that is free and answers
   * the stored professional. The store decides atomically, so two concurrent
   * inserts never share an id and an existing professional is never touched.
   * Candidates are consumed lazily: the iterable may never end.
   */
  insert(
    candidates: AsyncIterable<string>,
    draft: NewProfessional,
  ): Promise<Professional>;
  /** Sets the given fields; null when the professional does not exist. */
  update(id: string, patch: ProfessionalPatch): Promise<Professional | null>;
  /** Removes the professional with its photo. Not an error when it is already gone. */
  delete(id: string): Promise<void>;
}

export const PROFESSIONAL_WRITER = Symbol('PROFESSIONAL_WRITER');
