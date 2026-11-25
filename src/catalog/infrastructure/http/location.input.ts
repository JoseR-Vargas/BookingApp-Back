import { respond } from '../../../shared/infrastructure/http/respond';
import { LocationInput, LocationPatch } from '../../domain/location';
import {
  validateLocationCreate,
  validateLocationUpdate,
} from '../../domain/location.rules';
import { PublicAvailabilitySettings } from '../../domain/public-availability';
import { validatePublicAvailability } from '../../domain/public-availability.rules';
import {
  ScheduleInput,
  validateScheduleInput,
} from '../../domain/schedule-input.rules';

/**
 * Input of the location, schedule and public availability endpoints (the
 * project does not use class-validator). They hand the body to the domain
 * rules (the messages are the API's); the use cases only ever see validated
 * values. A broken rule leaves as a domain error.
 */

/** Body of `POST /admin/locations`: `name` is required, `address` defaults to ''. */
export const parseCreateLocationInput = (body: unknown): LocationInput =>
  respond(validateLocationCreate(body));

/** Body of `PUT /admin/locations/:id`: only the provided fields; at least one. */
export const parseUpdateLocationInput = (body: unknown): LocationPatch =>
  respond(validateLocationUpdate(body));

/** Body of `PUT /admin/schedule` and `PUT /admin/locations/:id/schedule`: the week, then the optional interval. */
export const parseScheduleInput = (body: unknown): ScheduleInput =>
  respond(validateScheduleInput(body));

/** Body of `PUT /admin/public-availability`: all three fields are required. */
export const parsePublicAvailabilityInput = (
  body: unknown,
): PublicAvailabilitySettings => respond(validatePublicAvailability(body));
