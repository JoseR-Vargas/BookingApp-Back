import {
  Location,
  LocationPatch,
  NewLocation,
  ScheduleChange,
} from '../../../domain/location';
import { toWeeklySchedule } from '../../../domain/location.rules';
import { LocationRecord } from './location.entity';

/**
 * Entity -> domain. A document stored before `address` or `startIntervalMinutes`
 * existed reads with their defaults ('' and 30).
 */
export function toLocation(record: LocationRecord): Location {
  return {
    id: record.id,
    name: record.name,
    address: record.address ?? '',
    active: record.active,
    weekly: record.weekly,
    slotIntervalMinutes: record.slotIntervalMinutes,
    startIntervalMinutes: toWeeklySchedule(record).startIntervalMinutes,
    createdAt: new Date(record.createdAt),
  };
}

/** Domain -> the fields of a new document (the `id` is the filter of the insert). */
export function toNewRecord(draft: NewLocation): Omit<LocationRecord, 'id'> {
  return {
    name: draft.name,
    address: draft.address,
    active: draft.active,
    weekly: draft.weekly,
    slotIntervalMinutes: draft.slotIntervalMinutes,
    startIntervalMinutes: draft.startIntervalMinutes,
    createdAt: draft.createdAt,
  };
}

/** The `$set` of an edit: only the fields given. */
export const toSetFields = (patch: LocationPatch): Record<string, unknown> => ({
  ...patch,
});

/** The `$set` of a schedule save: the start interval only when one is given. */
export const toScheduleFields = (
  change: ScheduleChange,
): Record<string, unknown> => ({
  weekly: change.weekly,
  slotIntervalMinutes: change.slotIntervalMinutes,
  ...(change.startIntervalMinutes === undefined
    ? {}
    : { startIntervalMinutes: change.startIntervalMinutes }),
});
