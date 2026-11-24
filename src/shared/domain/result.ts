import type { DomainError } from './domain-error';

/**
 * The outcome of a business operation: a value or a business failure, never
 * an exception. Narrow on `ok` before reading `value` or `error`; the
 * compiler refuses to read `value` of a result that may have failed.
 * Infrastructure failures are not results: they stay exceptions.
 */
export type Result<T, E extends DomainError = DomainError> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = <E extends DomainError>(error: E): Err<E> => ({
  ok: false,
  error,
});

/** Transforms the value of an `Ok`; an `Err` passes through. */
export const map = <T, U, E extends DomainError>(
  result: Result<T, E>,
  f: (value: T) => U,
): Result<U, E> => (result.ok ? ok(f(result.value)) : result);

/** Chains a step that may fail; the first `Err` stops the chain. */
export const andThen = <T, U, E extends DomainError>(
  result: Result<T, E>,
  f: (value: T) => Result<U, E>,
): Result<U, E> => (result.ok ? f(result.value) : result);

/** Transforms the error of an `Err`; an `Ok` passes through. */
export const mapErr = <T, E extends DomainError, F extends DomainError>(
  result: Result<T, E>,
  f: (error: E) => F,
): Result<T, F> => (result.ok ? result : err(f(result.error)));

/** Handles both outcomes and answers one value. */
export const match = <T, E extends DomainError, R>(
  result: Result<T, E>,
  handlers: { ok(value: T): R; err(error: E): R },
): R => (result.ok ? handlers.ok(result.value) : handlers.err(result.error));

/** The value of an `Ok`, or `fallback` for an `Err`. */
export const unwrapOr = <T, E extends DomainError>(
  result: Result<T, E>,
  fallback: T,
): T => (result.ok ? result.value : fallback);
