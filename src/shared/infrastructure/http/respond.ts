import { Result } from '../../domain/result';

/**
 * The HTTP edge of a `Result`: answers the value, or throws the business
 * error so the single `DomainErrorFilter` turns it into the HTTP answer.
 * It is the only place a business failure becomes an exception.
 */
export function respond<T>(result: Result<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}
