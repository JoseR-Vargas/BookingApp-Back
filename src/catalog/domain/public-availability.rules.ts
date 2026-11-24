import { Result, err, ok } from '../../shared/domain/result';
import { isBody } from './field.rules';
import {
  InvalidPublicAvailability,
  UnknownPublishedService,
} from './location.errors';
import { PublicAvailabilitySettings } from './public-availability';

export const PUBLIC_AVAILABILITY_MESSAGES = {
  enabled: 'El estado de la página pública debe ser verdadero o falso.',
  days: 'La cantidad de días debe ser un entero entre 1 y 14.',
  serviceIds:
    'Los servicios publicados deben ser null (todos) o una lista sin repetidos con al menos un servicio.',
} as const;

const fail = (message: string): Result<never, InvalidPublicAvailability> =>
  err(new InvalidPublicAvailability(message));

/** Body of "save public availability": all three fields are required. */
export function validatePublicAvailability(
  input: unknown,
): Result<PublicAvailabilitySettings, InvalidPublicAvailability> {
  if (!isBody(input)) {
    return fail('body must be a JSON object');
  }
  const { enabled, days, serviceIds } = input;
  if (typeof enabled !== 'boolean') {
    return fail(PUBLIC_AVAILABILITY_MESSAGES.enabled);
  }
  if (
    typeof days !== 'number' ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 14
  ) {
    return fail(PUBLIC_AVAILABILITY_MESSAGES.days);
  }
  if (serviceIds === null) {
    return ok({ enabled, days, serviceIds: null });
  }
  if (
    !Array.isArray(serviceIds) ||
    serviceIds.length === 0 ||
    serviceIds.some((id) => typeof id !== 'string' || id.trim() === '') ||
    new Set(serviceIds).size !== serviceIds.length
  ) {
    return fail(PUBLIC_AVAILABILITY_MESSAGES.serviceIds);
  }
  return ok({ enabled, days, serviceIds: serviceIds as string[] });
}

/** Every published service must exist (active or not); `null` publishes them all. */
export function ensurePublishedServicesExist(
  settings: PublicAvailabilitySettings,
  existingServiceIds: readonly string[],
): Result<PublicAvailabilitySettings, UnknownPublishedService> {
  const existing = new Set(existingServiceIds);
  return settings.serviceIds === null ||
    settings.serviceIds.every((id) => existing.has(id))
    ? ok(settings)
    : err(new UnknownPublishedService());
}
