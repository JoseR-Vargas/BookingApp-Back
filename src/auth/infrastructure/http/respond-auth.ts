import { UnauthorizedException } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { respond } from '../../../shared/infrastructure/http/respond';
import {
  InvalidCredentialsError,
  InvalidSessionError,
} from '../../domain/admin-user.errors';

/**
 * Like `respond`, but a failed login or a dead session answers 401 (the
 * shared error kinds have no "unauthorized"; every other error goes the
 * usual way).
 */
export function respondAuth<T>(result: Result<T>): T {
  if (
    !result.ok &&
    (result.error instanceof InvalidCredentialsError ||
      result.error instanceof InvalidSessionError)
  ) {
    throw new UnauthorizedException(result.error.message);
  }
  return respond(result);
}
