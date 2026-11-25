/**
 * Semantic category of a business-rule failure. It says WHAT went wrong, never
 * how it is reported: the infrastructure layer maps a kind to an HTTP status.
 */
export type DomainErrorKind =
  | 'validation'
  | 'not-found'
  | 'conflict'
  | 'forbidden'
  | 'unavailable'
  /**
   * The tenant context is missing or names another business (spec 18). It is a
   * programming error of the server, never a business failure of the request,
   * so it answers 500.
   */
  | 'tenant';

/**
 * Base class of every error a business rule can raise. It extends `Error`
 * only (the one inheritance the project allows) and knows nothing about HTTP.
 */
export class DomainError extends Error {
  constructor(
    readonly kind: DomainErrorKind,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
