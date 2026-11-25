import { WeeklySchedule } from '../../../shared/domain/schedule/schedule';

/**
 * The schedule of the legacy single-location installation, which the
 * migration copies into "principal". It is the `business_settings` document,
 * read through its own port.
 */
export interface LegacyScheduleReader {
  /** The stored schedule (a start interval stored without reads as 30), or the seed schedule when none was ever stored. */
  readSchedule(): Promise<WeeklySchedule>;
}

export const LEGACY_SCHEDULE_READER = Symbol('LEGACY_SCHEDULE_READER');
