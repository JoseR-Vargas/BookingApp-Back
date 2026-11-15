import { Model } from 'mongoose';

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 11000;

/**
 * Atomically inserts `doc` unless a document matching `uniqueFilter` already
 * exists. Existing documents are never modified, and a concurrent insert of
 * the same key (duplicate key error under a racing upsert) counts as "already
 * there". Returns whether THIS call created the document.
 *
 * `doc` must not repeat the fields of `uniqueFilter`.
 */
export async function insertIfAbsent<T>(
  model: Model<T>,
  uniqueFilter: Record<string, unknown>,
  doc: Record<string, unknown>,
): Promise<boolean> {
  try {
    const result = await model
      .updateOne(uniqueFilter, { $setOnInsert: doc }, { upsert: true })
      .exec();
    return result.upsertedCount > 0;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return false;
    }
    throw error;
  }
}
