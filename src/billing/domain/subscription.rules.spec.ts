import {
  InvalidSubscriptionTransition,
  SubscriptionNotFound,
} from './billing.errors';
import { Subscription } from './subscription';
import {
  activate,
  allowsNewBookings,
  cancelNow,
  effectiveStatus,
  markPastDue,
  requestCancellation,
  resumeSubscription,
  startTrialing,
} from './subscription.rules';

const NOW = new Date('2026-11-25T10:00:00Z');
const END = new Date('2026-12-25T10:00:00Z');
const LATER = new Date('2027-01-25T10:00:00Z');

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  planId: 'pro',
  status: 'active',
  currentPeriodEnd: END,
  cancelAtPeriodEnd: false,
  externalPaymentId: 'pay_1',
  createdAt: new Date('2026-10-25T10:00:00Z'),
  updatedAt: new Date('2026-10-25T10:00:00Z'),
  ...over,
});

const value = <T>(r: { ok: boolean; value?: T }): T => {
  expect(r.ok).toBe(true);
  return r.value as T;
};

describe('subscription state machine', () => {
  describe('startTrialing', () => {
    it('creates a trialing subscription that is not canceling', () => {
      const created = value(
        startTrialing(
          null,
          { planId: 'pro', externalPaymentId: 'pay_1', currentPeriodEnd: END },
          NOW,
        ),
      );
      expect(created).toEqual({
        planId: 'pro',
        status: 'trialing',
        currentPeriodEnd: END,
        cancelAtPeriodEnd: false,
        externalPaymentId: 'pay_1',
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    it('refuses to restart a subscription that already paid', () => {
      const r = startTrialing(
        sub(),
        { planId: 'pro', externalPaymentId: null, currentPeriodEnd: END },
        NOW,
      );
      expect(!r.ok && r.error).toBeInstanceOf(InvalidSubscriptionTransition);
    });
  });

  describe('activate (payment succeeded)', () => {
    const paid = {
      planId: 'negocio' as const,
      externalPaymentId: 'pay_2',
      currentPeriodEnd: LATER,
    };

    it('none -> active', () => {
      const created = value(activate(null, paid, NOW));
      expect(created).toMatchObject({
        planId: 'negocio',
        status: 'active',
        currentPeriodEnd: LATER,
        cancelAtPeriodEnd: false,
        externalPaymentId: 'pay_2',
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    it('trialing -> active', () => {
      expect(
        value(activate(sub({ status: 'trialing' }), paid, NOW)).status,
      ).toBe('active');
    });

    it('active -> active renews the period and keeps createdAt', () => {
      const renewed = value(activate(sub(), paid, NOW));
      expect(renewed.currentPeriodEnd).toEqual(LATER);
      expect(renewed.planId).toBe('negocio');
      expect(renewed.createdAt).toEqual(new Date('2026-10-25T10:00:00Z'));
      expect(renewed.updatedAt).toEqual(NOW);
    });

    it('past_due -> active', () => {
      expect(
        value(activate(sub({ status: 'past_due' }), paid, NOW)).status,
      ).toBe('active');
    });

    it('canceled -> active (the business contracts again)', () => {
      expect(
        value(activate(sub({ status: 'canceled' }), paid, NOW)).status,
      ).toBe('active');
    });

    it('a payment clears a pending cancellation', () => {
      expect(
        value(activate(sub({ cancelAtPeriodEnd: true }), paid, NOW))
          .cancelAtPeriodEnd,
      ).toBe(false);
    });
  });

  describe('markPastDue (payment failed)', () => {
    it('active -> past_due', () => {
      expect(value(markPastDue(sub(), NOW)).status).toBe('past_due');
    });

    it('trialing -> past_due', () => {
      expect(value(markPastDue(sub({ status: 'trialing' }), NOW)).status).toBe(
        'past_due',
      );
    });

    it('past_due -> past_due is a no-op', () => {
      const current = sub({ status: 'past_due' });
      expect(value(markPastDue(current, NOW))).toEqual(current);
    });

    it('canceled stays canceled: an error', () => {
      const r = markPastDue(sub({ status: 'canceled' }), NOW);
      expect(!r.ok && r.error).toBeInstanceOf(InvalidSubscriptionTransition);
    });

    it('without a subscription: not found', () => {
      const r = markPastDue(null, NOW);
      expect(!r.ok && r.error).toBeInstanceOf(SubscriptionNotFound);
    });
  });

  describe('cancelNow (the gateway ended the subscription)', () => {
    it.each(['trialing', 'active', 'past_due'] as const)(
      '%s -> canceled',
      (status) => {
        const r = value(
          cancelNow(sub({ status, cancelAtPeriodEnd: true }), NOW),
        );
        expect(r.status).toBe('canceled');
        expect(r.cancelAtPeriodEnd).toBe(false);
        expect(r.updatedAt).toEqual(NOW);
      },
    );

    it('canceled -> canceled is a no-op', () => {
      const current = sub({ status: 'canceled' });
      expect(value(cancelNow(current, NOW))).toEqual(current);
    });

    it('without a subscription: not found', () => {
      const r = cancelNow(null, NOW);
      expect(!r.ok && r.error).toBeInstanceOf(SubscriptionNotFound);
    });
  });

  describe('requestCancellation (at the end of the period)', () => {
    it.each(['trialing', 'active', 'past_due'] as const)(
      '%s keeps its status and marks cancelAtPeriodEnd',
      (status) => {
        const r = value(requestCancellation(sub({ status }), NOW));
        expect(r.status).toBe(status);
        expect(r.cancelAtPeriodEnd).toBe(true);
        expect(r.currentPeriodEnd).toEqual(END);
        expect(r.updatedAt).toEqual(NOW);
      },
    );

    it('asking twice changes nothing', () => {
      const current = sub({ cancelAtPeriodEnd: true });
      expect(value(requestCancellation(current, NOW))).toEqual(current);
    });

    it('a canceled subscription cannot be canceled again', () => {
      const r = requestCancellation(sub({ status: 'canceled' }), NOW);
      expect(!r.ok && r.error).toBeInstanceOf(InvalidSubscriptionTransition);
    });

    it('a subscription whose period already ended cannot be canceled again', () => {
      const r = requestCancellation(
        sub({
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
        }),
        NOW,
      );
      expect(!r.ok && r.error).toBeInstanceOf(InvalidSubscriptionTransition);
    });

    it('without a subscription: not found', () => {
      const r = requestCancellation(null, NOW);
      expect(!r.ok && r.error).toBeInstanceOf(SubscriptionNotFound);
    });
  });

  describe('resumeSubscription (before the period ends)', () => {
    it('clears the pending cancellation', () => {
      const r = value(
        resumeSubscription(sub({ cancelAtPeriodEnd: true }), NOW),
      );
      expect(r.cancelAtPeriodEnd).toBe(false);
      expect(r.status).toBe('active');
      expect(r.updatedAt).toEqual(NOW);
    });

    it('refuses when nothing is pending', () => {
      const r = resumeSubscription(sub(), NOW);
      expect(!r.ok && r.error).toBeInstanceOf(InvalidSubscriptionTransition);
    });

    it('refuses once the period ended', () => {
      const r = resumeSubscription(
        sub({
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date('2026-11-25T10:00:00Z'),
        }),
        NOW,
      );
      expect(!r.ok && r.error).toBeInstanceOf(InvalidSubscriptionTransition);
    });

    it('refuses a canceled subscription', () => {
      const r = resumeSubscription(
        sub({ status: 'canceled', cancelAtPeriodEnd: true }),
        NOW,
      );
      expect(!r.ok && r.error).toBeInstanceOf(InvalidSubscriptionTransition);
    });

    it('without a subscription: not found', () => {
      const r = resumeSubscription(null, NOW);
      expect(!r.ok && r.error).toBeInstanceOf(SubscriptionNotFound);
    });
  });

  describe('effectiveStatus and allowsNewBookings', () => {
    it('is the stored status while the period runs', () => {
      expect(effectiveStatus(sub({ cancelAtPeriodEnd: true }), NOW)).toBe(
        'active',
      );
      expect(effectiveStatus(sub({ status: 'past_due' }), NOW)).toBe(
        'past_due',
      );
    });

    it('becomes canceled when a pending cancellation reaches the end of the period', () => {
      const s = sub({ cancelAtPeriodEnd: true, currentPeriodEnd: NOW });
      expect(effectiveStatus(s, NOW)).toBe('canceled');
      expect(effectiveStatus(s, new Date(NOW.getTime() - 1))).toBe('active');
    });

    it('an active subscription past its end without cancellation stays active (the webhook may be late)', () => {
      expect(
        effectiveStatus(
          sub({ currentPeriodEnd: new Date('2026-01-01T00:00:00Z') }),
          NOW,
        ),
      ).toBe('active');
    });

    it('accepts bookings while trialing, active and past_due; blocks when canceled', () => {
      expect(allowsNewBookings(sub({ status: 'trialing' }), NOW)).toBe(true);
      expect(allowsNewBookings(sub(), NOW)).toBe(true);
      expect(allowsNewBookings(sub({ status: 'past_due' }), NOW)).toBe(true);
      expect(allowsNewBookings(sub({ status: 'canceled' }), NOW)).toBe(false);
      expect(
        allowsNewBookings(
          sub({ cancelAtPeriodEnd: true, currentPeriodEnd: NOW }),
          NOW,
        ),
      ).toBe(false);
    });
  });
});
