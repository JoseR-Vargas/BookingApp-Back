// ===== PUERTO: USO DEL PLAN =====
// What the business in force has created, for the limits of its plan.

export interface PlanUsageReader {
  /** Active professionals. */
  countProfessionals(): Promise<number>;
  /** Active locations. */
  countLocations(): Promise<number>;
  /** Bookings created in `[start, end)`, cancelled ones included. */
  countBookings(range: { start: Date; end: Date }): Promise<number>;
}

export const PLAN_USAGE_READER = Symbol('PLAN_USAGE_READER');
