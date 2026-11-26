// ===== PUERTO: RESERVAS DE UN NEGOCIO =====
// How many bookings a business has made, for its trial (spec 21).

/** Counts the bookings of a business. */
export interface TenantBookingCounter {
  /** Every booking of the business, cancelled ones included. */
  count(tenantId: string): Promise<number>;
}

export const TENANT_BOOKING_COUNTER = Symbol('TENANT_BOOKING_COUNTER');
