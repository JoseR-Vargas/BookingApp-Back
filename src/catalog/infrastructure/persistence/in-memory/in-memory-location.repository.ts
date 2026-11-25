import { LegacyScheduleReader } from '../../../application/ports/legacy-schedule.reader';
import { SeedLocation } from '../../../application/ports/location-repository.contract';
import { LocationReader } from '../../../application/ports/location.reader';
import { LocationWriter } from '../../../application/ports/location.writer';
import {
  Location,
  LocationPatch,
  NewLocation,
  ScheduleChange,
} from '../../../domain/location';
import {
  neverMigratedPrincipal,
  toWeeklySchedule,
} from '../../../domain/location.rules';
import { SEED_SCHEDULE } from '../../../domain/seed-schedule';

/** A copy, with the defaults of a location stored before those fields existed. */
const copy = (location: SeedLocation | Location): Location => ({
  id: location.id,
  name: location.name ?? location.id,
  address: location.address ?? '',
  active: location.active ?? true,
  weekly: structuredClone(location.weekly ?? SEED_SCHEDULE.weekly),
  slotIntervalMinutes:
    location.slotIntervalMinutes ?? SEED_SCHEDULE.slotIntervalMinutes,
  startIntervalMinutes: toWeeklySchedule({
    weekly: SEED_SCHEDULE.weekly,
    slotIntervalMinutes: SEED_SCHEDULE.slotIntervalMinutes,
    startIntervalMinutes: location.startIntervalMinutes,
  }).startIntervalMinutes,
  createdAt: new Date(location.createdAt ?? 0),
});

/**
 * Keeps the locations in memory, in creation order. An empty store reads as
 * the virtual "principal" of the legacy schedule, like the MongoDB adapter;
 * use-case and HTTP tests run on it.
 */
export class InMemoryLocationRepository
  implements LocationReader, LocationWriter
{
  private rows: Location[] = [];

  constructor(private readonly legacy: LegacyScheduleReader) {}

  /** Puts a location in the store as given (missing fields default), bypassing the port. */
  seed(location: SeedLocation): void {
    this.rows.push(copy(location));
  }

  get count(): number {
    return this.rows.length;
  }

  async list(): Promise<Location[]> {
    if (this.rows.length === 0) {
      return [neverMigratedPrincipal(await this.legacy.readSchedule())];
    }
    return this.rows.map(copy);
  }

  hasAny(): Promise<boolean> {
    return Promise.resolve(this.rows.length > 0);
  }

  async insert(
    candidates: AsyncIterable<string>,
    draft: NewLocation,
  ): Promise<Location> {
    for await (const id of candidates) {
      if (this.rows.some((row) => row.id === id)) continue;
      const stored = copy({ id, ...draft });
      this.rows.push(stored);
      return copy(stored);
    }
    throw new Error('The candidates ended before one was free');
  }

  insertIfAbsent(location: Location): Promise<boolean> {
    if (this.rows.some((row) => row.id === location.id)) {
      return Promise.resolve(false);
    }
    this.rows.push(copy(location));
    return Promise.resolve(true);
  }

  update(id: string, patch: LocationPatch): Promise<Location | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) return Promise.resolve(null);
    Object.assign(row, patch);
    return Promise.resolve(copy(row));
  }

  saveSchedule(id: string, change: ScheduleChange): Promise<Location | null> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) return Promise.resolve(null);
    row.weekly = structuredClone(change.weekly);
    row.slotIntervalMinutes = change.slotIntervalMinutes;
    if (change.startIntervalMinutes !== undefined) {
      row.startIntervalMinutes = change.startIntervalMinutes;
    }
    return Promise.resolve(copy(row));
  }
}
