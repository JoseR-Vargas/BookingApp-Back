// ===== PUERTO: PUERTA DEL PLAN =====
// Whether the business in force may create one more professional, location or
// booking under its plan (spec 23). The rule lives in billing; the modules
// only ask. A business without a subscription is not governed by a plan: the
// trial and storage rules of specs 21 and 22 stay as they were.
import { DomainError } from '../domain/domain-error';
import { Result } from '../domain/result';

export type PlanResource = 'professional' | 'location' | 'booking';

export interface PlanVerdict {
  /** A subscription governs the business: its trial no longer applies. */
  governs: boolean;
}

export interface PlanGate {
  /** `Err` (a 403 with the limit and the plan that solves it) when it may not create one more. */
  check(resource: PlanResource): Promise<Result<PlanVerdict, DomainError>>;
}

export const PLAN_GATE = Symbol('PLAN_GATE');
