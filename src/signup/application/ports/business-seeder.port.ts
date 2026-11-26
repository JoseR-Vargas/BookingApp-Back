// ===== PUERTO: SEMILLA DE UN NEGOCIO NUEVO =====
// The base a new business is born with: its "Principal" location and its
// schedule. No professionals or services (spec 21).

/** Seeds the business in force. */
export interface BusinessSeeder {
  /** Idempotent: it runs inside the scope of the new business. */
  seedBase(): Promise<void>;
}

export const BUSINESS_SEEDER = Symbol('BUSINESS_SEEDER');
