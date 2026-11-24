import { Service } from '../../domain/service';
import { ListScope } from './list-scope';

export interface ServiceReader {
  /** In creation order: the seeded defaults first, then the admin additions. */
  list(scope: ListScope): Promise<Service[]>;
  /** A service by id, active or not; null when there is none. */
  find(id: string): Promise<Service | null>;
  /** An active service by id; null when there is none or it is inactive. */
  findActive(id: string): Promise<Service | null>;
  /** The active services among `ids`, in no particular order. */
  findActiveByIds(ids: string[]): Promise<Service[]>;
  /** Every service (active or not) that lists the professional, in creation order. */
  offeredBy(professionalId: string): Promise<Service[]>;
}

export const SERVICE_READER = Symbol('SERVICE_READER');
