import {
  InvalidPaymentEvent,
  InvalidPlan,
  InvalidSubscriptionTransition,
  InvalidWebhookSignature,
  PlanLimitReached,
  SubscriptionEnded,
  SubscriptionNotFound,
} from '../../domain/billing.errors';
import { Subscription } from '../../domain/subscription';
import { NOW, buildBilling, signedEvent } from '../../billing.testing';

const DAY = 86_400_000;
const END = new Date(NOW.getTime() + 30 * DAY);

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  planId: 'pro',
  status: 'active',
  currentPeriodEnd: END,
  cancelAtPeriodEnd: false,
  externalPaymentId: 'fake_pay_sur_pro',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const ok = <T>(r: { ok: boolean; value?: T; error?: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value as T;
};

const succeeded = (over: Record<string, unknown> = {}) => ({
  id: 'evt_1',
  type: 'payment.succeeded',
  tenantSlug: 'sur',
  planId: 'pro',
  externalPaymentId: 'fake_pay_sur_pro',
  ...over,
});

describe('GetSubscriptionStatusUseCase', () => {
  it('answers null for a business without a subscription and does not count anything', async () => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      expect(ok(await b.status.execute())).toBeNull();
    });
    expect(b.usage.ranges).toEqual([]);
  });

  it('answers the plan, its limits and the usage of the current month', async () => {
    const b = buildBilling();
    b.usage.professionals = 2;
    b.usage.locations = 1;
    b.usage.bookings = 7;
    await b.inBusiness('sur', async () => {
      await b.subscriptions.save(sub({ cancelAtPeriodEnd: true }));
      expect(ok(await b.status.execute())).toEqual({
        planId: 'pro',
        status: 'active',
        currentPeriodEnd: END,
        cancelAtPeriodEnd: true,
        limits: {
          professionals: 3,
          locations: 2,
          bookingsPerMonth: 500,
          publicPage: true,
          reminders: true,
        },
        usage: { professionals: 2, locations: 1, bookingsThisMonth: 7 },
      });
    });
    expect(b.usage.ranges[0].start.toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    expect(b.usage.ranges[0].end.toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
  });

  it('reads canceled once a pending cancellation reaches the end of the period', async () => {
    const b = buildBilling({ now: new Date(END.getTime() + 1) });
    await b.inBusiness('sur', async () => {
      await b.subscriptions.save(sub({ cancelAtPeriodEnd: true }));
      expect(ok(await b.status.execute())).toMatchObject({
        status: 'canceled',
      });
    });
  });
});

describe('StartCheckoutUseCase', () => {
  it('asks the gateway for a payment of the business and answers its link', async () => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      const out = ok(await b.checkout.execute({ planId: 'pro' }));
      expect(out.externalPaymentId).toBe('fake_pay_sur_pro');
      expect(out.checkoutUrl).toContain(
        'http://localhost:5173/plan/fake-checkout?',
      );
    });
  });

  it('stores nothing until the payment is confirmed', async () => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      await b.checkout.execute({ planId: 'negocio' });
      await expect(b.subscriptions.find()).resolves.toBeNull();
    });
  });

  it.each([
    ['an unknown plan', 'enterprise'],
    ['nothing', undefined],
    ['a number', 3],
  ])('rejects %s', async (_name, planId) => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      const r = await b.checkout.execute({ planId });
      expect(!r.ok && r.error).toBeInstanceOf(InvalidPlan);
      expect(!r.ok && r.error.message).toBe('El plan elegido no existe.');
    });
  });

  it('rejects the free plan: it needs no payment', async () => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      const r = await b.checkout.execute({ planId: 'gratis' });
      expect(!r.ok && r.error.message).toBe(
        'El plan Gratis no requiere pago: elige un plan de pago.',
      );
    });
  });
});

describe('HandlePaymentWebhookUseCase', () => {
  const run = (
    b: ReturnType<typeof buildBilling>,
    event: Record<string, unknown>,
    secret?: string,
  ) => {
    const { rawBody, signature } = signedEvent(event, secret);
    return b.webhook.execute({ rawBody, signature });
  };
  const stored = (b: ReturnType<typeof buildBilling>, slug = 'sur') =>
    b.inBusiness(slug, () => b.subscriptions.find());

  it('rejects an event without a valid signature, changing nothing and recording nothing', async () => {
    const b = buildBilling();
    const { rawBody } = signedEvent(succeeded());
    for (const signature of [
      undefined,
      'bad',
      signedEvent(succeeded(), 'other').signature,
    ]) {
      const r = await b.webhook.execute({ rawBody, signature });
      expect(!r.ok && r.error).toBeInstanceOf(InvalidWebhookSignature);
    }
    await expect(stored(b)).resolves.toBeNull();
    await expect(b.events.has('evt_1')).resolves.toBe(false);
  });

  it('rejects a signed body it cannot understand', async () => {
    const b = buildBilling();
    const r = await run(b, { nothing: true });
    expect(!r.ok && r.error).toBeInstanceOf(InvalidPaymentEvent);
  });

  it('rejects an event of an unknown business', async () => {
    const b = buildBilling();
    const r = await run(b, succeeded({ tenantSlug: 'nadie' }));
    expect(!r.ok && r.error.kind).toBe('not-found');
  });

  it('payment.succeeded activates the subscription of the business of the event, with the period the gateway says', async () => {
    const b = buildBilling();
    const periodEnd = '2027-01-15T00:00:00.000Z';
    const r = await run(b, succeeded({ currentPeriodEnd: periodEnd }));
    expect(ok(r)).toEqual({ outcome: 'processed' });
    await expect(stored(b)).resolves.toEqual({
      planId: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(periodEnd),
      cancelAtPeriodEnd: false,
      externalPaymentId: 'fake_pay_sur_pro',
      createdAt: NOW,
      updatedAt: NOW,
    });
    // Another business is untouched.
    await expect(stored(b, 'norte')).resolves.toBeNull();
  });

  it('without a period in the event, the payment covers 30 days from now', async () => {
    const b = buildBilling();
    await run(b, succeeded());
    expect((await stored(b))!.currentPeriodEnd).toEqual(END);
  });

  it('payment.succeeded without a plan is an invalid event and records nothing', async () => {
    const b = buildBilling();
    const r = await run(b, succeeded({ planId: undefined }));
    expect(!r.ok && r.error).toBeInstanceOf(InvalidPaymentEvent);
    await expect(b.events.has('evt_1')).resolves.toBe(false);
  });

  it('the same event twice changes nothing the second time', async () => {
    const b = buildBilling();
    await run(b, succeeded());
    const first = await stored(b);
    b.time.now = new Date(NOW.getTime() + 5 * DAY);
    const again = await run(b, succeeded());
    expect(ok(again)).toEqual({ outcome: 'duplicate' });
    await expect(stored(b)).resolves.toEqual(first);
  });

  it('payment.failed -> past_due, keeping the plan and the period', async () => {
    const b = buildBilling();
    await run(b, succeeded());
    await run(b, { id: 'evt_2', type: 'payment.failed', tenantSlug: 'sur' });
    await expect(stored(b)).resolves.toMatchObject({
      status: 'past_due',
      planId: 'pro',
      currentPeriodEnd: END,
    });
  });

  it('payment.succeeded after past_due -> active again', async () => {
    const b = buildBilling();
    await run(b, succeeded());
    await run(b, { id: 'evt_2', type: 'payment.failed', tenantSlug: 'sur' });
    await run(b, succeeded({ id: 'evt_3' }));
    await expect(stored(b)).resolves.toMatchObject({ status: 'active' });
  });

  it('subscription.canceled -> canceled', async () => {
    const b = buildBilling();
    await run(b, succeeded());
    await run(b, {
      id: 'evt_2',
      type: 'subscription.canceled',
      tenantSlug: 'sur',
    });
    await expect(stored(b)).resolves.toMatchObject({ status: 'canceled' });
  });

  it('subscription.trial_started -> trialing', async () => {
    const b = buildBilling();
    await run(b, succeeded({ type: 'subscription.trial_started' }));
    await expect(stored(b)).resolves.toMatchObject({
      status: 'trialing',
      planId: 'pro',
    });
  });

  it('an event that does not apply (failure with no subscription) is acknowledged, ignored and recorded', async () => {
    const b = buildBilling();
    const r = await run(b, {
      id: 'evt_9',
      type: 'payment.failed',
      tenantSlug: 'sur',
    });
    expect(ok(r)).toEqual({ outcome: 'ignored' });
    await expect(stored(b)).resolves.toBeNull();
    await expect(b.events.has('evt_9')).resolves.toBe(true);
  });

  it('an unknown event type is acknowledged, ignored and recorded', async () => {
    const b = buildBilling();
    const r = await run(b, {
      id: 'evt_x',
      type: 'invoice.created',
      tenantSlug: 'sur',
    });
    expect(ok(r)).toEqual({ outcome: 'ignored' });
    await expect(b.events.has('evt_x')).resolves.toBe(true);
  });
});

describe('CancelSubscriptionUseCase / ResumeSubscriptionUseCase', () => {
  it('cancel marks cancelAtPeriodEnd, keeps the status and tells the gateway', async () => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      await b.subscriptions.save(sub());
      const saved = ok(await b.cancel.execute());
      expect(saved).toMatchObject({
        status: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: END,
      });
      await expect(b.subscriptions.find()).resolves.toEqual(saved);
    });
    expect(b.gateway.calls).toEqual([
      { action: 'cancelAtPeriodEnd', externalPaymentId: 'fake_pay_sur_pro' },
    ]);
  });

  it('cancel twice does not tell the gateway twice', async () => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      await b.subscriptions.save(sub());
      await b.cancel.execute();
      await b.cancel.execute();
    });
    expect(b.gateway.calls).toHaveLength(1);
  });

  it('resume clears the pending cancellation and tells the gateway', async () => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      await b.subscriptions.save(sub({ cancelAtPeriodEnd: true }));
      expect(ok(await b.resume.execute())).toMatchObject({
        cancelAtPeriodEnd: false,
      });
    });
    expect(b.gateway.calls).toEqual([
      { action: 'resume', externalPaymentId: 'fake_pay_sur_pro' },
    ]);
  });

  it('a subscription without gateway payment id does not call the gateway', async () => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      await b.subscriptions.save(sub({ externalPaymentId: null }));
      await b.cancel.execute();
    });
    expect(b.gateway.calls).toEqual([]);
  });

  it('answer not-found without subscription and conflict when it does not apply, changing nothing', async () => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      const none = await b.cancel.execute();
      expect(!none.ok && none.error).toBeInstanceOf(SubscriptionNotFound);
      await b.subscriptions.save(sub());
      const nothingPending = await b.resume.execute();
      expect(!nothingPending.ok && nothingPending.error).toBeInstanceOf(
        InvalidSubscriptionTransition,
      );
      await b.subscriptions.save(sub({ status: 'canceled' }));
      const ended = await b.cancel.execute();
      expect(!ended.ok && ended.error).toBeInstanceOf(
        InvalidSubscriptionTransition,
      );
      await expect(b.subscriptions.find()).resolves.toMatchObject({
        status: 'canceled',
        cancelAtPeriodEnd: false,
      });
    });
    expect(b.gateway.calls).toEqual([]);
  });
});

describe('CheckPlanLimitUseCase (the plan gate)', () => {
  it('a business without a subscription is not governed by a plan', async () => {
    const b = buildBilling();
    b.usage.professionals = 99;
    await b.inBusiness('sur', async () => {
      for (const resource of ['professional', 'location', 'booking'] as const) {
        expect(ok(await b.gate.execute(resource))).toEqual({ governs: false });
      }
    });
    expect(b.usage.ranges).toEqual([]);
  });

  it('allows while under the limit and says the plan governs', async () => {
    const b = buildBilling();
    b.usage.professionals = 2;
    await b.inBusiness('sur', async () => {
      await b.subscriptions.save(sub());
      expect(ok(await b.gate.execute('professional'))).toEqual({
        governs: true,
      });
    });
  });

  it.each([
    [
      'professional',
      'professionals',
      3,
      'Alcanzaste el límite de profesionales del plan Pro (3 profesionales). Contrata el plan Negocio (hasta 10 profesionales) para ampliarlo.',
    ],
    [
      'location',
      'locations',
      2,
      'Alcanzaste el límite de locales del plan Pro (2 locales). Contrata el plan Negocio (hasta 5 locales) para ampliarlo.',
    ],
    [
      'booking',
      'bookings',
      500,
      'Alcanzaste el límite de reservas al mes del plan Pro (500 reservas al mes). Contrata el plan Negocio (hasta 2000 reservas al mes) para ampliarlo.',
    ],
  ] as const)(
    'refuses a %s at the limit with the message of the limit',
    async (resource, field, count, message) => {
      const b = buildBilling();
      b.usage[field] = count;
      await b.inBusiness('sur', async () => {
        await b.subscriptions.save(sub());
        const r = await b.gate.execute(resource);
        expect(!r.ok && r.error).toBeInstanceOf(PlanLimitReached);
        expect(!r.ok && r.error.message).toBe(message);
      });
    },
  );

  it('counts the bookings of the current month only', async () => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      await b.subscriptions.save(sub());
      await b.gate.execute('booking');
    });
    expect(b.usage.ranges).toEqual([
      {
        start: new Date('2026-11-01T00:00:00Z'),
        end: new Date('2026-12-01T00:00:00Z'),
      },
    ]);
  });

  it('past_due and trialing keep accepting bookings', async () => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      for (const status of ['past_due', 'trialing'] as const) {
        await b.subscriptions.save(sub({ status }));
        expect(ok(await b.gate.execute('booking'))).toEqual({ governs: true });
      }
    });
  });

  it('a canceled subscription refuses new bookings with its own message, but not other creations under the limit', async () => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      await b.subscriptions.save(sub({ status: 'canceled' }));
      const r = await b.gate.execute('booking');
      expect(!r.ok && r.error).toBeInstanceOf(SubscriptionEnded);
      expect(ok(await b.gate.execute('professional'))).toEqual({
        governs: true,
      });
    });
  });

  it('cancelAtPeriodEnd keeps accepting bookings until the period ends, then refuses', async () => {
    const b = buildBilling();
    await b.inBusiness('sur', async () => {
      await b.subscriptions.save(sub({ cancelAtPeriodEnd: true }));
      expect(ok(await b.gate.execute('booking'))).toEqual({ governs: true });
      b.time.now = END;
      const r = await b.gate.execute('booking');
      expect(!r.ok && r.error).toBeInstanceOf(SubscriptionEnded);
    });
  });

  it('the limits of a business are its own: another business with no subscription is free', async () => {
    const b = buildBilling();
    b.usage.professionals = 3;
    await b.inBusiness('sur', () => b.subscriptions.save(sub()));
    await b.inBusiness('norte', async () => {
      expect(ok(await b.gate.execute('professional'))).toEqual({
        governs: false,
      });
    });
  });
});
