import { Result, err, ok } from '../../shared/domain/result';
import { WeeklySchedule } from '../../shared/domain/schedule/schedule';
import { isBody } from './field.rules';
import {
  Location,
  LocationInput,
  LocationPatch,
  NewLocation,
  ScheduleChange,
} from './location';
import {
  InvalidLocationData,
  LOCATION_MESSAGES,
  LastActiveLocation,
} from './location.errors';
import { SEED_SCHEDULE as SCHEDULE } from './seed-schedule';

/** The location every pre-multi-location installation migrates into. */
export const PRINCIPAL_LOCATION = {
  id: 'principal',
  name: 'Principal',
  address: '',
} as const;

/** Creation time of the "principal" that a never-migrated store reads as. */
const NEVER_MIGRATED_AT = new Date(0);

/** The schedule of a stored location; one stored before the start interval existed reads as 30. */
export const toWeeklySchedule = (
  location: Pick<Location, 'weekly' | 'slotIntervalMinutes'> &
    Partial<Pick<Location, 'startIntervalMinutes'>>,
): WeeklySchedule => ({
  weekly: location.weekly,
  slotIntervalMinutes: location.slotIntervalMinutes,
  startIntervalMinutes:
    location.startIntervalMinutes ?? SCHEDULE.startIntervalMinutes,
});

export const scheduleOf = (location: Location): WeeklySchedule =>
  toWeeklySchedule(location);

/** Active locations, oldest first (a tie keeps the order of the list). */
export const activeLocations = (locations: readonly Location[]): Location[] =>
  locations
    .filter((location) => location.active)
    .map((location, index) => ({ location, index }))
    .sort(
      (a, b) =>
        a.location.createdAt.getTime() - b.location.createdAt.getTime() ||
        a.index - b.index,
    )
    .map(({ location }) => location);

export const activeLocationIds = (locations: readonly Location[]): string[] =>
  activeLocations(locations).map((location) => location.id);

/** The default location: the oldest active one; null when none is active. */
export const defaultLocation = (
  locations: readonly Location[],
): Location | null => activeLocations(locations)[0] ?? null;

/** Id of the default location; null when none is active. */
export const defaultLocationId = (
  locations: readonly Location[],
): string | null => defaultLocation(locations)?.id ?? null;

/**
 * The "principal" location: active, with a COPY of the given schedule. It is
 * what the startup migration stores, and what a never-migrated store reads as.
 */
export const principalLocation = (
  schedule: WeeklySchedule,
  createdAt: Date,
): Location => ({
  ...PRINCIPAL_LOCATION,
  active: true,
  weekly: schedule.weekly,
  slotIntervalMinutes: schedule.slotIntervalMinutes,
  startIntervalMinutes: schedule.startIntervalMinutes,
  createdAt,
});

/** The "principal" a store that was never migrated reads as. */
export const neverMigratedPrincipal = (schedule: WeeklySchedule): Location =>
  principalLocation(schedule, NEVER_MIGRATED_AT);

const fail = (message: string): Result<never, InvalidLocationData> =>
  err(new InvalidLocationData(message));

function locationName(value: unknown): Result<string, InvalidLocationData> {
  const name = typeof value === 'string' ? value.trim() : '';
  return name.length >= 1 && name.length <= 80
    ? ok(name)
    : fail(LOCATION_MESSAGES.name);
}

function locationAddress(value: unknown): Result<string, InvalidLocationData> {
  const address = typeof value === 'string' ? value.trim() : '';
  return typeof value === 'string' && address.length <= 200
    ? ok(address)
    : fail(LOCATION_MESSAGES.address);
}

/** Body of "create location": `name` is required, `address` defaults to ''. */
export function validateLocationCreate(
  body: unknown,
): Result<LocationInput, InvalidLocationData> {
  if (!isBody(body)) return fail('body must be a JSON object');
  const name = locationName(body.name);
  if (!name.ok) return name;
  const address =
    body.address === undefined ? ok('') : locationAddress(body.address);
  if (!address.ok) return address;
  return ok({ name: name.value, address: address.value });
}

/** Body of "edit location": only the provided fields, at least one. */
export function validateLocationUpdate(
  body: unknown,
): Result<LocationPatch, InvalidLocationData> {
  if (!isBody(body)) return fail('body must be a JSON object');
  const patch: LocationPatch = {};
  if (body.name !== undefined) {
    const name = locationName(body.name);
    if (!name.ok) return name;
    patch.name = name.value;
  }
  if (body.address !== undefined) {
    const address = locationAddress(body.address);
    if (!address.ok) return address;
    patch.address = address.value;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return fail(LOCATION_MESSAGES.active);
    patch.active = body.active;
  }
  return Object.keys(patch).length === 0
    ? fail(LOCATION_MESSAGES.noEditableField)
    : ok(patch);
}

/** A new location: active, with the seed schedule (a start every 30 minutes). */
export const newLocation = (
  input: LocationInput,
  createdAt: Date,
): NewLocation => ({
  name: input.name,
  address: input.address,
  active: true,
  weekly: SCHEDULE.weekly,
  slotIntervalMinutes: SCHEDULE.slotIntervalMinutes,
  startIntervalMinutes: SCHEDULE.startIntervalMinutes,
  createdAt,
});

/**
 * A schedule to store: the week as given, the fixed slot interval and the
 * start interval only when one was sent (absent keeps the stored one).
 */
export const scheduleChange = (
  weekly: ScheduleChange['weekly'],
  startIntervalMinutes?: number,
): ScheduleChange => ({
  weekly,
  slotIntervalMinutes: SCHEDULE.slotIntervalMinutes,
  ...(startIntervalMinutes === undefined ? {} : { startIntervalMinutes }),
});

/**
 * The last active location cannot be deactivated. (The check and the write are
 * not one transaction: two admins deactivating the last two locations at once
 * could both pass.)
 */
export function ensureCanChange(
  locations: readonly Location[],
  current: Location,
  patch: LocationPatch,
): Result<LocationPatch, LastActiveLocation> {
  const othersActive = locations.some(
    (location) => location.active && location.id !== current.id,
  );
  return patch.active === false && current.active && !othersActive
    ? err(new LastActiveLocation())
    : ok(patch);
}
