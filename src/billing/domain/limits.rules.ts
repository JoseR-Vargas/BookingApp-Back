// ===== REGLAS DE LÍMITES =====
// Which limit a plan reached and the message that says so (spec 23). Pure: the
// counts and the clock come in.
import { Result, err, ok } from '../../shared/domain/result';
import { PlanLimitReached } from './billing.errors';
import { PLANS, Plan, PlanId, PlanLimits, planById } from './plans';

/** What a plan limits: the three things a business creates. */
export type LimitedResource = 'professionals' | 'locations' | 'bookings';

const LIMIT_FIELD: Record<LimitedResource, keyof PlanLimits> = {
  professionals: 'professionals',
  locations: 'locations',
  bookings: 'bookingsPerMonth',
};

const WORDING: Record<
  LimitedResource,
  { what: string; one: string; many: string }
> = {
  professionals: {
    what: 'profesionales',
    one: 'profesional',
    many: 'profesionales',
  },
  locations: { what: 'locales', one: 'local', many: 'locales' },
  bookings: {
    what: 'reservas al mes',
    one: 'reserva al mes',
    many: 'reservas al mes',
  },
};

/** The number a plan allows of a resource. */
export const limitOf = (planId: PlanId, resource: LimitedResource): number =>
  planById(planId).limits[LIMIT_FIELD[resource]] as number;

const amount = (resource: LimitedResource, n: number): string =>
  `${n} ${n === 1 ? WORDING[resource].one : WORDING[resource].many}`;

/** The smallest plan above `plan` that allows more of the resource, or null. */
function solvingPlan(plan: Plan, resource: LimitedResource): Plan | null {
  const current = limitOf(plan.id, resource);
  return PLANS.find((p) => limitOf(p.id, resource) > current) ?? null;
}

/**
 * Whether the business may create one more `resource` on `planId` when it
 * already has `used`. The error names the limit and the plan that solves it.
 */
export function checkLimit(
  planId: PlanId,
  resource: LimitedResource,
  used: number,
): Result<void, PlanLimitReached> {
  const plan = planById(planId);
  const limit = limitOf(planId, resource);
  if (used < limit) return ok(undefined);
  const next = solvingPlan(plan, resource);
  const remedy = next
    ? `Contrata el plan ${next.name} (hasta ${amount(resource, limitOf(next.id, resource))}) para ampliarlo.`
    : 'Contacta con soporte para ampliarlo.';
  return err(
    new PlanLimitReached(
      `Alcanzaste el límite de ${WORDING[resource].what} del plan ${plan.name} (${amount(resource, limit)}). ${remedy}`,
    ),
  );
}

/** The calendar month (UTC) of `now`: from its first instant to the first of the next month. */
export function monthBounds(now: Date): { start: Date; end: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
  };
}
