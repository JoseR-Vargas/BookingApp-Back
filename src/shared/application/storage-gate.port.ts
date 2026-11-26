// ===== PUERTO: PUERTA DEL ALMACENAMIENTO =====
// Whether the business in force may still grow its data (spec 22): a business
// over its storage quota takes no new bookings and no new photos. The rule
// lives in the tenancy; the modules only ask.

export interface StorageGate {
  /** True when the business may add data. */
  allowsNewData(): Promise<boolean>;
}

export const STORAGE_GATE = Symbol('STORAGE_GATE');
