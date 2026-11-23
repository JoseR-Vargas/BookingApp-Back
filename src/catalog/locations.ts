import { Model } from 'mongoose';
import { SCHEDULE, WeeklySchedule } from './catalog.config';
import { insertIfAbsent } from './insert-if-absent';
import {
  BusinessSettingsRecord,
  SCHEDULE_KEY,
} from './schemas/business-settings.schema';
import { LocationRecord } from './schemas/location.schema';

/** The location every pre-multi-location installation migrates into. */
export const PRINCIPAL_LOCATION = {
  id: 'principal',
  name: 'Principal',
  address: '',
} as const;

/** An unknown or inactive location id; controllers map it to a 404. */
export class LocationNotFoundError extends Error {
  constructor(readonly locationId: string) {
    super(`Location "${locationId}" not found`);
    this.name = 'LocationNotFoundError';
  }
}

export const toWeeklySchedule = (
  record: Pick<
    LocationRecord,
    'weekly' | 'slotIntervalMinutes' | 'startIntervalMinutes'
  >,
): WeeklySchedule => ({
  weekly: record.weekly,
  slotIntervalMinutes: record.slotIntervalMinutes,
  // Documents stored before the field existed read as 30.
  startIntervalMinutes:
    record.startIntervalMinutes ?? SCHEDULE.startIntervalMinutes,
});

/**
 * The schedule of the legacy single-location installation: the
 * `business_settings` document, or the seed when nothing was ever stored.
 */
export async function legacySchedule(
  settingsModel: Model<BusinessSettingsRecord>,
): Promise<WeeklySchedule> {
  const stored = await settingsModel
    .findOne({ key: SCHEDULE_KEY })
    .lean<BusinessSettingsRecord | null>()
    .exec();
  return stored?.weekly ? toWeeklySchedule(stored) : SCHEDULE;
}

/**
 * Startup migration. When `locations` is empty, creates "principal" with a
 * COPY of the legacy schedule (business_settings is never modified). The
 * insert is atomic on the id, so concurrent instances create it once; an
 * existing collection is never touched.
 */
export async function ensurePrincipalLocation(
  locationModel: Model<LocationRecord>,
  settingsModel: Model<BusinessSettingsRecord>,
): Promise<void> {
  const any = await locationModel.exists({}).exec();
  if (any !== null) {
    return;
  }
  const { id, ...fields } = PRINCIPAL_LOCATION;
  await insertIfAbsent(
    locationModel,
    { id },
    {
      ...fields,
      active: true,
      ...(await legacySchedule(settingsModel)),
      createdAt: new Date(),
    },
  );
}

/**
 * Every location in creation order. A database that was never migrated reads
 * as one virtual "principal" with the legacy schedule, so reads never fail
 * between a deploy and the first startup migration.
 */
export async function loadLocations(
  locationModel: Model<LocationRecord>,
  settingsModel: Model<BusinessSettingsRecord>,
): Promise<LocationRecord[]> {
  const stored = await locationModel
    .find({})
    .sort({ _id: 1 })
    .lean<LocationRecord[]>()
    .exec();
  if (stored.length > 0) {
    return stored;
  }
  return [
    {
      ...PRINCIPAL_LOCATION,
      active: true,
      ...(await legacySchedule(settingsModel)),
      createdAt: new Date(0),
    },
  ];
}

/** Active locations, oldest first: the first one is the default location. */
export const activeLocations = (
  locations: LocationRecord[],
): LocationRecord[] =>
  locations
    .filter((location) => location.active)
    .map((location, index) => ({ location, index }))
    .sort(
      (a, b) =>
        new Date(a.location.createdAt).getTime() -
          new Date(b.location.createdAt).getTime() || a.index - b.index,
    )
    .map(({ location }) => location);

/** A professional without `locationIds` works at the default location. */
export const professionalLocationIds = (
  record: { locationIds?: string[] },
  defaultLocationId: string,
): string[] => record.locationIds ?? [defaultLocationId];
