// ===== PLANES (CONFIGURACIÓN DEL SISTEMA) =====
// The plans live in code, not in the database (spec 23): they change without a
// migration and the owner of the system sets them. Pure data and lookups.

export const PLAN_IDS = ['gratis', 'pro', 'negocio'] as const;

export type PlanId = (typeof PLAN_IDS)[number];

/** What a plan allows. */
export interface PlanLimits {
  /** Active professionals. */
  professionals: number;
  /** Active locations. */
  locations: number;
  /** Bookings created in a calendar month. */
  bookingsPerMonth: number;
  /** Whether the public page may be shown (informative: not enforced by spec 23). */
  publicPage: boolean;
  /** Whether reminders may be sent (spec 24). */
  reminders: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  limits: PlanLimits;
}

/** From the smallest to the biggest: the order decides "the plan that solves a limit". */
export const PLANS: readonly Plan[] = [
  {
    id: 'gratis',
    name: 'Gratis',
    limits: {
      professionals: 1,
      locations: 1,
      bookingsPerMonth: 50,
      publicPage: false,
      reminders: false,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    limits: {
      professionals: 3,
      locations: 2,
      bookingsPerMonth: 500,
      publicPage: true,
      reminders: true,
    },
  },
  {
    id: 'negocio',
    name: 'Negocio',
    limits: {
      professionals: 10,
      locations: 5,
      bookingsPerMonth: 2000,
      publicPage: true,
      reminders: true,
    },
  },
];

export const isPlanId = (value: unknown): value is PlanId =>
  typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);

/** The plan with this id. */
export const planById = (id: PlanId): Plan =>
  PLANS.find((plan) => plan.id === id) as Plan;
