import { DayOfWeek, DaySchedule } from '../../shared/domain/schedule/schedule';

/** A business location (local) with its own weekly schedule. */
export interface Location {
  /** Slug generated from the name; unique and immutable. */
  id: string;
  name: string;
  address: string;
  active: boolean;
  /** Keyed 0 (Sunday) to 6 (Saturday). */
  weekly: Record<DayOfWeek, DaySchedule>;
  /** Fixed at 30; the admin cannot change it. */
  slotIntervalMinutes: number;
  /** Minutes between the start times offered to the public; a multiple of 30. */
  startIntervalMinutes: number;
  /** Decides which active location is the default (the oldest one). */
  createdAt: Date;
}

/** What an admin sets on a location: its name and address. */
export interface LocationInput {
  name: string;
  address: string;
}

/** The fields an edit may change. */
export type LocationPatch = Partial<LocationInput & { active: boolean }>;

/** Everything a new location is stored with, but its id. */
export type NewLocation = Omit<Location, 'id'>;

/**
 * A weekly schedule to store on a location. The occupancy slot interval is
 * fixed by the rules; an undefined `startIntervalMinutes` keeps the stored one.
 */
export interface ScheduleChange {
  weekly: Record<DayOfWeek, DaySchedule>;
  slotIntervalMinutes: number;
  startIntervalMinutes?: number;
}
