import {
  Location,
  LocationPatch,
  NewLocation,
  ScheduleChange,
} from '../../domain/location';

export interface LocationWriter {
  /**
   * Stores `draft` under the first of `candidates` that is free and answers
   * the stored location. The store decides atomically, so two concurrent
   * inserts never share an id and an existing location is never touched.
   * Candidates are consumed lazily: the iterable may never end.
   */
  insert(
    candidates: AsyncIterable<string>,
    draft: NewLocation,
  ): Promise<Location>;
  /**
   * Stores `location` unless one with its id exists, atomically by id (the
   * migration to "principal"). An existing location is never modified.
   * Answers whether THIS call stored it.
   */
  insertIfAbsent(location: Location): Promise<boolean>;
  /** Sets the given fields; null when the location does not exist. */
  update(id: string, patch: LocationPatch): Promise<Location | null>;
  /**
   * Replaces the weekly schedule and the slot interval of a location (active
   * or not); the start interval only when given. Null when it does not exist.
   */
  saveSchedule(id: string, change: ScheduleChange): Promise<Location | null>;
}

export const LOCATION_WRITER = Symbol('LOCATION_WRITER');
