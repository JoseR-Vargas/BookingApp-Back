// The rules of the owner panel (spec 25): which actions of the owner of the
// system are valid, and the Spanish message of every refusal. Pure: the
// businesses, the clock and the data come in, the answer comes out.

import { PlanId, isPlanId } from '../../billing/domain/plans';
import { Result, err, ok } from '../../shared/domain/result';
import { TRIAL_DAYS } from '../../tenancy/domain/trial.rules';
import {
  BusinessAlreadyActive,
  BusinessAlreadyOnPlan,
  BusinessAlreadySuspended,
  BusinessHasNoTrial,
  InvalidTrialDays,
  LastBusinessCannotBeSuspended,
  TrialAlreadyExpired,
  UnknownPlan,
} from './platform.errors';

/** The shortest and the longest trial extension the owner may grant. */
export const MIN_TRIAL_EXTENSION_DAYS = 1;
export const MAX_TRIAL_EXTENSION_DAYS = 365;

/** What the rules need to know about the business of the request. */
export interface PanelBusiness {
  /** The id of the business (the `_id` of its document). */
  id: string;
  /** Whether the business answers requests. */
  status: 'active' | 'suspended';
  /** When its trial ends; null when it has no trial (spec 21). */
  trialEndsAt: Date | null;
  /** The plan it pays; null when it has no subscription (spec 23). */
  planId: PlanId | null;
}

/** What a reactivation changes. */
export interface ReactivateOutcome {
  /** The business was suspended and now answers requests again. */
  statusChanged: boolean;
  /** The new deadline of the trial when it starts again; null when it does not. */
  trialEndsAt: Date | null;
}

/**
 * The days of a trial extension: a whole number of days between 1 and 365.
 * A number or a string of digits is accepted (the panel sends a number).
 */
export function parseTrialDays(days: unknown): Result<number> {
  const value =
    typeof days === 'number'
      ? days
      : typeof days === 'string' && days.trim() !== ''
        ? Number(days)
        : NaN;
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < MIN_TRIAL_EXTENSION_DAYS ||
    value > MAX_TRIAL_EXTENSION_DAYS
  ) {
    return err(new InvalidTrialDays());
  }
  return ok(value);
}

/**
 * Suspending a business: the installation must keep at least one business
 * answering, so the only active business of the system cannot be suspended.
 */
export function canSuspendBusiness(
  business: Pick<PanelBusiness, 'status'>,
  activeBusinesses: number,
): Result<void> {
  if (business.status === 'suspended') {
    return err(new BusinessAlreadySuspended());
  }
  if (activeBusinesses <= 1) {
    return err(new LastBusinessCannotBeSuspended());
  }
  return ok(undefined);
}

/**
 * Reactivating a business: a suspended one starts answering again. A trial
 * that expired starts again too (it lasts the same days as the trial of the
 * signup, spec 21): that is what lets the owner extend it afterwards, since
 * an expired trial cannot be extended (the rule below).
 */
export function canReactivateBusiness(
  business: Pick<PanelBusiness, 'status' | 'trialEndsAt'>,
  now: Date,
): Result<ReactivateOutcome> {
  const expired =
    business.trialEndsAt !== null &&
    business.trialEndsAt.getTime() <= now.getTime();
  const restarted = expired
    ? new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
    : null;
  if (business.status === 'suspended') {
    return ok({ statusChanged: true, trialEndsAt: restarted });
  }
  if (expired) {
    return ok({ statusChanged: false, trialEndsAt: restarted });
  }
  return err(new BusinessAlreadyActive());
}

/**
 * Extending the trial of a business: only a business that has a trial and
 * whose trial is still running may get more days. An expired trial must be
 * reactivated first.
 */
export function canExtendTrial(
  business: Pick<PanelBusiness, 'trialEndsAt'>,
  days: unknown,
  now: Date,
): Result<number> {
  const parsed = parseTrialDays(days);
  if (!parsed.ok) return parsed;
  if (business.trialEndsAt === null) {
    return err(new BusinessHasNoTrial());
  }
  if (business.trialEndsAt.getTime() <= now.getTime()) {
    return err(new TrialAlreadyExpired());
  }
  return ok(parsed.value);
}

/**
 * A manual plan change (no gateway): the plan must exist and it must be a
 * different one, so the log of the change always means something.
 */
export function canChangePlan(
  business: Pick<PanelBusiness, 'planId'>,
  planId: unknown,
): Result<PlanId> {
  if (!isPlanId(planId)) {
    return err(new UnknownPlan());
  }
  if (business.planId === planId) {
    return err(new BusinessAlreadyOnPlan(planId));
  }
  return ok(planId);
}
