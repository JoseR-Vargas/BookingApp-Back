// ===== COMPENSACIÓN =====
// The local MongoDB has no multi-document transactions, so a signup that fails
// halfway undoes what it created instead of rolling back (spec 21).

import { Result } from '../../shared/domain/result';

/**
 * Runs `work`; if it fails (an `Err` or an exception), runs `undo` and then
 * answers the same failure. An exception is an infrastructure failure: it is
 * rethrown after the undo so it still ends in a 500.
 */
export async function withCompensation<T>(
  work: () => Promise<Result<T>>,
  undo: () => Promise<void>,
): Promise<Result<T>> {
  let result: Result<T>;
  try {
    result = await work();
  } catch (error) {
    await undo().catch(() => undefined);
    throw error;
  }
  if (!result.ok) await undo();
  return result;
}
