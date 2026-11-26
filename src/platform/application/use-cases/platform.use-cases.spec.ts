import { PlatformBusinessReader } from '../platform-business-reader';
import { ChangePlanUseCase } from './change-plan.use-case';
import { ExtendTrialUseCase } from './extend-trial.use-case';
import { GetBusinessDetailUseCase } from './get-business-detail.use-case';
import { GetPlatformMetricsUseCase } from './get-platform-metrics.use-case';
import { ListBusinessesUseCase } from './list-businesses.use-case';
import { ReactivateBusinessUseCase } from './reactivate-business.use-case';
import { SuspendBusinessUseCase } from './suspend-business.use-case';
import {
  FakeTenants,
  IN_TWO_DAYS,
  LAST_WEEK,
  NOW,
  aSubscription,
  aTenant,
  buildPlatform,
} from '../../platform.testing';

describe('the use cases of the owner panel (spec 25)', () => {
  const build = () => {
    const fakes = buildPlatform();
    const reader = new PlatformBusinessReader(
      fakes.tenants,
      fakes.subscriptions,
      fakes.usage,
      fakes.clock,
    );
    return {
      fakes,
      list: new ListBusinessesUseCase(reader),
      detail: new GetBusinessDetailUseCase(reader, fakes.usage, fakes.clock),
      metrics: new GetPlatformMetricsUseCase(
        reader,
        fakes.usage,
        fakes.metricsCache,
        fakes.clock,
      ),
      suspend: new SuspendBusinessUseCase(
        reader,
        fakes.lifecycle,
        fakes.tenantCache,
        fakes.audit,
      ),
      reactivate: new ReactivateBusinessUseCase(
        reader,
        fakes.lifecycle,
        fakes.tenantCache,
        fakes.audit,
        fakes.clock,
      ),
      extendTrial: new ExtendTrialUseCase(
        reader,
        fakes.lifecycle,
        fakes.tenantCache,
        fakes.audit,
        fakes.clock,
      ),
      changePlan: new ChangePlanUseCase(
        reader,
        fakes.admin,
        fakes.audit,
        fakes.clock,
      ),
    };
  };

  describe('listing the businesses', () => {
    it('answers the signals of every business and never the data of a client', async () => {
      const { fakes, list } = build();
      fakes.tenants.rows = [
        aTenant({ id: 'id-sur', slug: 'sur', name: 'Barbería Sur' }),
        aTenant({
          id: 'id-norte',
          slug: 'norte',
          name: 'Norte',
          trialEndsAt: IN_TWO_DAYS,
          status: 'suspended',
          storageQuotaBytes: null,
          storageUsedBytes: 0,
        }),
      ];
      fakes.subscriptions.rows = [
        { tenantId: 'id-sur', subscription: aSubscription('pro') },
      ];
      fakes.usage.bookings.set('id-sur', 12);
      fakes.usage.lastUse.set('id-sur', new Date('2026-11-25T09:00:00.000Z'));

      const result = await list.execute();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([
        {
          id: 'id-sur',
          slug: 'sur',
          name: 'Barbería Sur',
          status: 'active',
          plan: { id: 'pro', name: 'Pro' },
          subscriptionStatus: 'active',
          trial: null,
          bookingsThisMonth: 12,
          storage: { usedBytes: 1024, quotaBytes: 52428800 },
          lastUseAt: new Date('2026-11-25T09:00:00.000Z'),
        },
        {
          id: 'id-norte',
          slug: 'norte',
          name: 'Norte',
          status: 'suspended',
          plan: null,
          subscriptionStatus: null,
          trial: { endsAt: IN_TWO_DAYS, daysLeft: 2 },
          bookingsThisMonth: 0,
          storage: { usedBytes: 0, quotaBytes: null },
          lastUseAt: null,
        },
      ]);
    });
  });

  describe('the detail of a business', () => {
    it('answers its breakdown and its catalog', async () => {
      const { fakes, detail } = build();
      fakes.tenants.rows = [aTenant()];
      fakes.usage.breakdowns.set('id-sur', {
        professionals: [{ id: 'alex', bookings: 3 }],
        services: [{ id: 'corte', bookings: 3 }],
        locations: [{ id: 'principal', bookings: 3 }],
      });
      fakes.usage.catalog.set('id-sur', {
        professionals: 2,
        services: 4,
        locations: 1,
      });

      const result = await detail.execute('id-sur');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.business.slug).toBe('sur');
      expect(result.value.breakdown).toEqual({
        professionals: [{ id: 'alex', bookings: 3 }],
        services: [{ id: 'corte', bookings: 3 }],
        locations: [{ id: 'principal', bookings: 3 }],
        catalog: { professionals: 2, services: 4, locations: 1 },
      });
    });

    it('does not find a business that does not exist', async () => {
      const { detail } = build();

      const result = await detail.execute('nadie');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe('Negocio no encontrado.');
    });
  });

  describe('the metrics of the installation', () => {
    it('counts the businesses, the bookings and the active subscriptions of each plan', async () => {
      const { fakes, metrics } = build();
      fakes.tenants.rows = [
        aTenant({ id: 'id-sur' }),
        aTenant({ id: 'id-norte', slug: 'norte', trialEndsAt: IN_TWO_DAYS }),
        aTenant({ id: 'id-old', slug: 'old', status: 'suspended' }),
      ];
      fakes.subscriptions.rows = [
        { tenantId: 'id-sur', subscription: aSubscription('pro') },
        { tenantId: 'id-norte', subscription: aSubscription('pro') },
        {
          tenantId: 'id-old',
          subscription: aSubscription('negocio', { status: 'canceled' }),
        },
      ];
      fakes.usage.bookings.set('id-sur', 4);
      fakes.usage.bookings.set('id-norte', 6);

      const result = await metrics.execute();

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.metrics.businesses).toEqual({
        total: 3,
        active: 2,
        inTrial: 1,
        suspended: 1,
      });
      expect(result.value.metrics.bookings).toEqual({
        today: 10,
        thisMonth: 10,
      });
      expect(result.value.metrics.estimatedRevenueByPlan).toEqual([
        { planId: 'pro', subscriptions: 2 },
      ]);
      expect(result.value.metrics.generatedAt).toEqual(NOW);
      expect(result.value.expiresAt).toEqual(new Date(NOW.getTime() + 60_000));
    });

    it('are cached: the second visit does not read the database again', async () => {
      const { fakes, metrics } = build();
      fakes.tenants.rows = [aTenant()];

      const first = await metrics.execute();
      const reads = fakes.usage.reads;
      const second = await metrics.execute();

      expect(first.ok && second.ok).toBe(true);
      expect(fakes.usage.reads).toBe(reads);
      expect(fakes.metricsCache.sets).toBe(1);
    });
  });

  describe('suspending a business', () => {
    it('refuses to suspend the only business that answers', async () => {
      const { fakes, suspend } = build();
      fakes.tenants.rows = [aTenant()];

      const result = await suspend.execute('id-sur');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe(
        'No se puede suspender el único negocio activo del sistema.',
      );
      expect(fakes.lifecycle.calls).toEqual([]);
      expect(fakes.audit.entries).toEqual([]);
    });

    it('suspends it, forgets the cached business and leaves a trace', async () => {
      const { fakes, suspend } = build();
      fakes.tenants.rows = [
        aTenant(),
        aTenant({ id: 'id-norte', slug: 'norte' }),
      ];

      const result = await suspend.execute('id-sur');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.status).toBe('suspended');
      expect(fakes.lifecycle.calls).toEqual([
        { id: 'id-sur', status: 'suspended' },
      ]);
      expect(fakes.tenantCache.slugs).toEqual(['sur']);
      expect(fakes.audit.entries).toEqual([
        {
          businessId: 'id-sur',
          action: 'suspend',
          from: 'active',
          to: 'suspended',
          detail: null,
        },
      ]);
    });

    it('does not find a business that does not exist', async () => {
      const { suspend } = build();

      const result = await suspend.execute('nadie');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe('Negocio no encontrado.');
    });
  });

  describe('reactivating a business', () => {
    it('brings a suspended business back', async () => {
      const { fakes, reactivate } = build();
      fakes.tenants.rows = [
        aTenant({ status: 'suspended' }),
        aTenant({ id: 'id-norte', slug: 'norte' }),
      ];

      const result = await reactivate.execute('id-sur');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.status).toBe('active');
      expect(fakes.lifecycle.calls).toEqual([
        { id: 'id-sur', status: 'active' },
      ]);
      expect(fakes.tenantCache.slugs).toEqual(['sur']);
    });

    it('starts again the trial of a business whose trial expired', async () => {
      const { fakes, reactivate } = build();
      fakes.tenants.rows = [
        aTenant({ trialEndsAt: LAST_WEEK }),
        aTenant({ id: 'id-norte', slug: 'norte' }),
      ];

      const result = await reactivate.execute('id-sur');

      expect(result.ok).toBe(true);
      expect(fakes.lifecycle.calls).toEqual([
        { id: 'id-sur', trialEndsAt: new Date('2026-12-10T10:00:00.000Z') },
      ]);
    });

    it('refuses an active business whose trial is still running', async () => {
      const { fakes, reactivate } = build();
      fakes.tenants.rows = [aTenant({ trialEndsAt: IN_TWO_DAYS })];

      const result = await reactivate.execute('id-sur');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe('Este negocio ya está activo.');
      expect(fakes.lifecycle.calls).toEqual([]);
    });
  });

  describe('extending the trial', () => {
    it('adds the days to the deadline and leaves a trace', async () => {
      const { fakes, extendTrial } = build();
      fakes.tenants.rows = [aTenant({ trialEndsAt: IN_TWO_DAYS })];

      const result = await extendTrial.execute('id-sur', 7);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.trial).toEqual({
        endsAt: new Date('2026-12-05T10:00:00.000Z'),
        daysLeft: 9,
      });
      expect(fakes.lifecycle.calls).toEqual([
        { id: 'id-sur', trialEndsAt: new Date('2026-12-05T10:00:00.000Z') },
      ]);
      expect(fakes.audit.entries[0].action).toBe('extend-trial');
    });

    it('refuses a trial that expired', async () => {
      const { fakes, extendTrial } = build();
      fakes.tenants.rows = [aTenant({ trialEndsAt: LAST_WEEK })];

      const result = await extendTrial.execute('id-sur', 7);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe(
        'La prueba de este negocio ya venció: reactívalo antes de extenderla.',
      );
      expect(fakes.lifecycle.calls).toEqual([]);
    });

    it('refuses days that are not a whole number of days in range', async () => {
      const { fakes, extendTrial } = build();
      fakes.tenants.rows = [aTenant({ trialEndsAt: IN_TWO_DAYS })];

      const result = await extendTrial.execute('id-sur', 0);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe(
        'Los días de la prueba deben ser un número entero entre 1 y 365.',
      );
    });
  });

  describe('changing the plan by hand', () => {
    it('changes the plan and leaves a trace with the old and the new one', async () => {
      const { fakes, changePlan } = build();
      fakes.tenants.rows = [aTenant()];
      fakes.subscriptions.rows = [
        { tenantId: 'id-sur', subscription: aSubscription('gratis') },
      ];

      const result = await changePlan.execute('id-sur', 'pro');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.plan).toEqual({ id: 'pro', name: 'Pro' });
      expect(fakes.admin.calls).toEqual([
        { tenantId: 'id-sur', planId: 'pro' },
      ]);
      expect(fakes.audit.entries[0]).toMatchObject({
        businessId: 'id-sur',
        action: 'change-plan',
        from: 'gratis',
        to: 'pro',
      });
    });

    it('refuses a plan that does not exist', async () => {
      const { fakes, changePlan } = build();
      fakes.tenants.rows = [aTenant()];

      const result = await changePlan.execute('id-sur', 'platino');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe('El plan elegido no existe.');
      expect(fakes.admin.calls).toEqual([]);
      expect(fakes.audit.entries).toEqual([]);
    });
  });
});
