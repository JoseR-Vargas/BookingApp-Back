import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { DomainError } from '../shared/domain/domain-error';
import { Result } from '../shared/domain/result';
import {
  NoActiveLocationError,
  ServiceSelectionFailedError,
} from './domain/catalog.errors';
import { LocationNotFound } from './domain/location.errors';
import { PRINCIPAL_LOCATION } from './domain/location.rules';
import { LocationNotFoundError } from './locations';
import { ServiceSelectionError } from './service-selection';

/**
 * Hands a use case's value to a caller that still expects exceptions (the
 * temporary facades, until each consumer migrates). The errors the unmigrated
 * modules recognize are rebuilt as they were (a ServiceSelectionError, a
 * LocationNotFoundError); any other business failure is thrown as the domain
 * error and ends in the same HTTP answer.
 */
export function orThrow<T>(result: Result<T>): T {
  if (result.ok) {
    return result.value;
  }
  const { error } = result;
  if (error instanceof ServiceSelectionFailedError) {
    throw new ServiceSelectionError(error.failure, error.serviceId);
  }
  if (error instanceof LocationNotFound) {
    throw new LocationNotFoundError(error.locationId);
  }
  if (error instanceof NoActiveLocationError) {
    throw new LocationNotFoundError(PRINCIPAL_LOCATION.id);
  }
  throw error;
}

const TO_HTTP: Record<DomainError['kind'], (message: string) => HttpException> =
  {
    validation: (message) => new BadRequestException(message),
    'not-found': (message) => new NotFoundException(message),
    conflict: (message) => new ConflictException(message),
    forbidden: (message) => new ForbiddenException(message),
  };

/**
 * The write side of the admin facade: a business failure leaves as the Nest
 * exception the admin routes always raised (a 400 or a 404).
 */
export function orThrowHttp<T>(result: Result<T>): T {
  if (result.ok) {
    return result.value;
  }
  throw TO_HTTP[result.error.kind](result.error.message);
}
