import { GetSubscriptionStatusUseCase } from '../../../billing/application/use-cases/get-subscription-status.use-case';
import { PlanStatus } from '../../../billing/domain/plan-status';
import { PlanId } from '../../../billing/domain/plans';
import { Result, ok } from '../../../shared/domain/result';
import { BillingReminderPlan } from './billing-reminder-plan';

const statusOf = (planId: PlanId): PlanStatus => ({
  planId,
  status: 'active',
  currentPeriodEnd: new Date('2026-12-25T10:00:00Z'),
  cancelAtPeriodEnd: false,
  limits: {
    professionals: 1,
    locations: 1,
    bookingsPerMonth: 50,
    publicPage: false,
    reminders: planId !== 'gratis',
  },
  usage: { professionals: 0, locations: 0, bookingsThisMonth: 0 },
});

describe('BillingReminderPlan', () => {
  const plan = (value: PlanStatus | null) => {
    const useCase = {
      execute: (): Promise<Result<PlanStatus | null>> =>
        Promise.resolve(ok(value)),
    } as unknown as GetSubscriptionStatusUseCase;
    return new BillingReminderPlan(useCase);
  };

  it('does not allow reminders on the free plan', async () => {
    await expect(plan(statusOf('gratis')).allowsReminders()).resolves.toBe(
      false,
    );
  });

  it('allows them on the plans that have them', async () => {
    await expect(plan(statusOf('pro')).allowsReminders()).resolves.toBe(true);
    await expect(plan(statusOf('negocio')).allowsReminders()).resolves.toBe(
      true,
    );
  });

  it('allows them on a business without a subscription', async () => {
    await expect(plan(null).allowsReminders()).resolves.toBe(true);
  });
});
