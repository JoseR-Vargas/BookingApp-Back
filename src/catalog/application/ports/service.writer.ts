import { NewService, Service, ServicePatch } from '../../domain/service';

export interface ServiceWriter {
  /**
   * Stores `draft` under the first of `candidates` that is free and answers
   * the stored service. Atomic, never touches an existing service; candidates
   * are consumed lazily.
   */
  insert(
    candidates: AsyncIterable<string>,
    draft: NewService,
  ): Promise<Service>;
  /** Sets the given fields; null when the service does not exist. */
  update(id: string, patch: ServicePatch): Promise<Service | null>;
  /** Removes the service. Not an error when it is already gone. */
  delete(id: string): Promise<void>;
  /** Removes the professional from the list of every service that names it. */
  removeProfessional(professionalId: string): Promise<void>;
}

export const SERVICE_WRITER = Symbol('SERVICE_WRITER');
