// ===== MÁQUINA DE ESTADOS DE LA SUSCRIPCIÓN =====
// trialing -> active -> past_due -> canceled, plus the cancellation at the end
// of the period (spec 23). Pure functions over a `Subscription | null`: the
// clock comes in and nothing is stored here.
import { Result, err, ok } from '../../shared/domain/result';
import {
  InvalidSubscriptionTransition,
  SubscriptionNotFound,
} from './billing.errors';
import { PlanId } from './plans';
import { Subscription, SubscriptionStatus } from './subscription';

/** What a confirmed payment tells about the subscription. */
export interface PaidPeriod {
  planId: PlanId;
  externalPaymentId: string | null;
  currentPeriodEnd: Date;
}

const touch = (
  subscription: Subscription,
  changes: Partial<Subscription>,
  now: Date,
): Subscription => ({ ...subscription, ...changes, updatedAt: now });

const missing = (): Result<Subscription> => err(new SubscriptionNotFound());

/** The status that counts now: a cancellation at the end of the period takes effect when the period ends. */
export function effectiveStatus(
  subscription: Subscription,
  now: Date,
): SubscriptionStatus {
  if (
    subscription.status !== 'canceled' &&
    subscription.cancelAtPeriodEnd &&
    now.getTime() >= subscription.currentPeriodEnd.getTime()
  ) {
    return 'canceled';
  }
  return subscription.status;
}

/** A trialing, a past_due or an active business accepts bookings; a canceled one does not. */
export const allowsNewBookings = (
  subscription: Subscription,
  now: Date,
): boolean => effectiveStatus(subscription, now) !== 'canceled';

/** none | canceled -> trialing (the gateway starts a trial). */
export function startTrialing(
  current: Subscription | null,
  period: PaidPeriod,
  now: Date,
): Result<Subscription> {
  if (current && effectiveStatus(current, now) !== 'canceled') {
    return err(
      new InvalidSubscriptionTransition(
        'El negocio ya tiene una suscripción vigente.',
      ),
    );
  }
  return ok({
    planId: period.planId,
    status: 'trialing',
    currentPeriodEnd: period.currentPeriodEnd,
    cancelAtPeriodEnd: false,
    externalPaymentId: period.externalPaymentId,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  });
}

/**
 * A payment succeeded: none | trialing | active | past_due | canceled -> active,
 * with the plan and the period the payment covers. A new payment clears a
 * pending cancellation.
 */
export function activate(
  current: Subscription | null,
  period: PaidPeriod,
  now: Date,
): Result<Subscription> {
  return ok({
    planId: period.planId,
    status: 'active',
    currentPeriodEnd: period.currentPeriodEnd,
    cancelAtPeriodEnd: false,
    externalPaymentId:
      period.externalPaymentId ?? current?.externalPaymentId ?? null,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  });
}

/** A payment failed: trialing | active -> past_due (past_due stays; canceled is an error). */
export function markPastDue(
  current: Subscription | null,
  now: Date,
): Result<Subscription> {
  if (!current) return missing();
  if (current.status === 'canceled') {
    return err(
      new InvalidSubscriptionTransition(
        'La suscripción está cancelada: un pago fallido no la cambia.',
      ),
    );
  }
  if (current.status === 'past_due') return ok(current);
  return ok(touch(current, { status: 'past_due' }, now));
}

/** The gateway ended the subscription: trialing | active | past_due -> canceled. */
export function cancelNow(
  current: Subscription | null,
  now: Date,
): Result<Subscription> {
  if (!current) return missing();
  if (current.status === 'canceled') return ok(current);
  return ok(
    touch(current, { status: 'canceled', cancelAtPeriodEnd: false }, now),
  );
}

/** The owner cancels: the access stays until the period ends. Asking twice changes nothing. */
export function requestCancellation(
  current: Subscription | null,
  now: Date,
): Result<Subscription> {
  if (!current) return missing();
  if (effectiveStatus(current, now) === 'canceled') {
    return err(
      new InvalidSubscriptionTransition('La suscripción ya está cancelada.'),
    );
  }
  if (current.cancelAtPeriodEnd) return ok(current);
  return ok(touch(current, { cancelAtPeriodEnd: true }, now));
}

/** The owner changes their mind before the period ends. */
export function resumeSubscription(
  current: Subscription | null,
  now: Date,
): Result<Subscription> {
  if (!current) return missing();
  if (effectiveStatus(current, now) === 'canceled') {
    return err(
      new InvalidSubscriptionTransition(
        'La suscripción ya terminó: contrata un plan de nuevo.',
      ),
    );
  }
  if (!current.cancelAtPeriodEnd) {
    return err(
      new InvalidSubscriptionTransition(
        'La suscripción no tiene una cancelación pendiente.',
      ),
    );
  }
  return ok(touch(current, { cancelAtPeriodEnd: false }, now));
}
