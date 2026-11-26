import { Clock } from '../../../shared/application/clock.port';
import { TenantContext } from '../../../shared/application/tenant-context.port';
import {
  AvailabilityCache,
  AvailabilityKey,
} from '../../application/ports/availability-cache.port';
import { LocatedAvailability } from '../../domain/availability';

/** The default live time of an answer. */
export const DEFAULT_AVAILABILITY_CACHE_TTL_SECONDS = 60;

interface Entry {
  value: LocatedAvailability;
  expiresAt: number;
}

interface BusinessEntries {
  /** Bumped by every invalidation; a `set` with an older stamp is dropped. */
  version: number;
  entries: Map<string, Entry>;
}

/**
 * Answers of the availability in the memory of the process, partitioned by the
 * business in force (`TenantContext`): an entry is only reachable from the
 * business that stored it. With several instances each one has its own cache,
 * so a change made on another instance shows up after at most one TTL.
 */
export class InMemoryAvailabilityCache implements AvailabilityCache {
  private readonly businesses = new Map<string, BusinessEntries>();

  constructor(
    private readonly clock: Clock,
    private readonly context: TenantContext,
    private readonly ttlMs: number,
  ) {}

  get(key: AvailabilityKey): LocatedAvailability | undefined {
    const business = this.businesses.get(this.context.current().id);
    const id = keyOf(key);
    const entry = business?.entries.get(id);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.clock.now().getTime()) {
      business!.entries.delete(id);
      return undefined;
    }
    return structuredClone(entry.value);
  }

  stamp(): number {
    return this.business().version;
  }

  set(key: AvailabilityKey, value: LocatedAvailability, stamp: number): void {
    if (this.ttlMs <= 0) return;
    const business = this.business();
    if (business.version !== stamp) return;
    const now = this.clock.now().getTime();
    for (const [id, entry] of business.entries) {
      if (entry.expiresAt <= now) business.entries.delete(id);
    }
    business.entries.set(keyOf(key), {
      value: structuredClone(value),
      expiresAt: now + this.ttlMs,
    });
  }

  invalidateBusiness(): void {
    const business = this.business();
    business.version += 1;
    business.entries.clear();
  }

  /** How many entries the business in force holds (for tests). */
  size(): number {
    return this.business().entries.size;
  }

  private business(): BusinessEntries {
    const id = this.context.current().id;
    let business = this.businesses.get(id);
    if (!business) {
      business = { version: 0, entries: new Map() };
      this.businesses.set(id, business);
    }
    return business;
  }
}

const keyOf = ({ date, serviceIds, locationId }: AvailabilityKey): string =>
  JSON.stringify([date, serviceIds, locationId ?? null]);
