// ===== PARTICIÓN POR NEGOCIO (EN MEMORIA) =====
// The in-memory adapters of the repositories keep the documents of every
// business apart, so the contract suites can prove the isolation without a
// database (spec 18).
//
// The partition is the business in force. OUTSIDE a request there is none, so
// the adapters fall back to `DEFAULT_PARTITION`: the unit tests that run
// without a request keep working. The MongoDB adapter does NOT fall back: it
// fails closed (see `tenantScopePlugin`).

import { currentTenantId } from './tenant-scope.storage';

/** The partition used when there is no business in the context. */
export const DEFAULT_PARTITION = '__no-tenant__';

/** The business the code runs in, or the default partition. */
export function currentPartition(): string {
  return currentTenantId() ?? DEFAULT_PARTITION;
}

/**
 * A list of rows, each one belonging to the business that stored it. Only the
 * rows of the business in force are visible.
 */
export class TenantRows<T> {
  private rows: { partition: string; value: T }[] = [];

  /** Stores a value in the partition in force. */
  add(value: T): void {
    this.rows.push({ partition: currentPartition(), value });
  }

  /** Every value of the partition in force, in insertion order. */
  all(): T[] {
    const partition = currentPartition();
    return this.rows
      .filter((row) => row.partition === partition)
      .map((row) => row.value);
  }

  /** The first value of the partition in force that matches. */
  find(predicate: (value: T) => boolean): T | undefined {
    return this.all().find(predicate);
  }

  /** Every value of the partition in force that matches. */
  filter(predicate: (value: T) => boolean): T[] {
    return this.all().filter(predicate);
  }

  /** Removes every value of the partition in force that matches. */
  remove(predicate: (value: T) => boolean): void {
    const partition = currentPartition();
    this.rows = this.rows.filter(
      (row) => row.partition !== partition || !predicate(row.value),
    );
  }

  /** How many values the partition in force holds. */
  get size(): number {
    return this.all().length;
  }
}
