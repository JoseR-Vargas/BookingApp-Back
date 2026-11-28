/**
 * Test-only wiring of the owner panel (spec 25): the use cases over in-memory
 * adapters and a fixed clock. The same fakes feed the use case suite and the
 * HTTP suite.
 */
import { Clock } from '../shared/application/clock.port';
import { Tenant } from '../tenancy/domain/tenant';
import { TenantDirectory } from '../tenancy/application/ports/tenant-directory.port';
import { TenantLifecycleWriter } from '../tenancy/application/ports/tenant-lifecycle.port';
import { TenantCacheInvalidator } from '../tenancy/application/ports/tenant-cache.port';
import { Subscription } from '../billing/domain/subscription';
import { SubscriptionDirectory } from '../billing/application/ports/subscription-directory.port';
import { SubscriptionAdministrator } from '../billing/application/ports/subscription-administrator.port';
import { PlanId } from '../billing/domain/plans';
import {
  PlatformBreakdown,
  PlatformCatalogSize,
  PlatformUsage,
} from './domain/platform-usage';
import { PlatformUsageReader } from './application/ports/platform-usage.port';
import { TenantEraser } from '../tenancy/application/ports/tenant-eraser.port';
import {
  CachedMetrics,
  PlatformMetricsCache,
} from './application/ports/platform-metrics-cache.port';
import { PlatformMetrics } from './domain/platform-metrics';
import {
  PlatformAudit,
  PlatformAuditEntry,
} from './application/ports/platform-audit.port';

export const NOW = new Date('2026-11-26T10:00:00.000Z');
export const IN_TWO_DAYS = new Date('2026-11-28T10:00:00.000Z');
export const LAST_WEEK = new Date('2026-11-19T10:00:00.000Z');

/** A business of the installation, for the tests. */
export function aTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'id-sur',
    slug: 'sur',
    name: 'Barbería Sur',
    status: 'active',
    isDefault: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    trialEndsAt: null,
    bookingQuota: null,
    storageQuotaBytes: 52428800,
    storageUsedBytes: 1024,
    storageMeasuredAt: new Date('2026-11-20T00:00:00.000Z'),
    ...overrides,
  };
}

/** The businesses of the installation, in memory. */
export class FakeTenants implements TenantDirectory {
  rows: Tenant[] = [];
  list(): Promise<Tenant[]> {
    return Promise.resolve(this.rows.map((row) => ({ ...row })));
  }
}

/** The subscriptions of the installation, in memory. */
export class FakeSubscriptions implements SubscriptionDirectory {
  rows: { tenantId: string; subscription: Subscription }[] = [];
  list(): Promise<{ tenantId: string; subscription: Subscription }[]> {
    return Promise.resolve(
      this.rows.map((row) => ({
        tenantId: row.tenantId,
        subscription: { ...row.subscription },
      })),
    );
  }
}

/** A subscription of a business. */
export function aSubscription(
  planId: PlanId,
  over: Partial<Subscription> = {},
): Subscription {
  return {
    planId,
    status: 'active',
    currentPeriodEnd: new Date('2026-12-26T10:00:00.000Z'),
    cancelAtPeriodEnd: false,
    externalPaymentId: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...over,
  };
}

/** What every business did, in memory. */
export class FakeUsage implements PlatformUsageReader {
  bookings = new Map<string, number>();
  lastUse = new Map<string, Date>();
  breakdowns = new Map<string, PlatformBreakdown>();
  catalog = new Map<string, PlatformCatalogSize>();
  /** How many times the usage was read: the cache must stop it. */
  reads = 0;

  usage(): Promise<PlatformUsage> {
    this.reads += 1;
    return Promise.resolve({
      bookingsByBusiness: new Map(this.bookings),
      lastUseByBusiness: new Map(this.lastUse),
    });
  }

  breakdown(tenantId: string): Promise<PlatformBreakdown> {
    return Promise.resolve(
      this.breakdowns.get(tenantId) ?? {
        professionals: [],
        services: [],
        locations: [],
      },
    );
  }

  catalogSize(tenantId: string): Promise<PlatformCatalogSize> {
    return Promise.resolve(
      this.catalog.get(tenantId) ?? {
        professionals: 0,
        services: 0,
        locations: 0,
      },
    );
  }
}

/** The writes of the owner of the system on the businesses, in memory. */
export class FakeLifecycle implements TenantLifecycleWriter {
  calls: { id: string; status?: string; trialEndsAt?: Date }[] = [];
  constructor(private readonly tenants: FakeTenants) {}

  setStatus(id: string, status: 'active' | 'suspended'): Promise<Tenant> {
    this.calls.push({ id, status });
    const row = this.tenants.rows.find((r) => r.id === id);
    if (!row) return Promise.reject(new Error('no such business'));
    row.status = status;
    return Promise.resolve({ ...row });
  }

  setTrialEndsAt(id: string, trialEndsAt: Date): Promise<Tenant> {
    this.calls.push({ id, trialEndsAt });
    const row = this.tenants.rows.find((r) => r.id === id);
    if (!row) return Promise.reject(new Error('no such business'));
    row.trialEndsAt = trialEndsAt;
    return Promise.resolve({ ...row });
  }
}

/** The businesses whose cached state was forgotten. */
export class FakeTenantCache implements TenantCacheInvalidator {
  slugs: string[] = [];
  invalidate(slug: string): void {
    this.slugs.push(slug);
  }
}

/** What the owner did, in memory. */
export class FakeAudit implements PlatformAudit {
  entries: PlatformAuditEntry[] = [];
  record(entry: PlatformAuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

/** The eraser of a business, in memory: it takes the business off the list. */
export class FakeEraser implements TenantEraser {
  calls: { tenantId: string }[] = [];
  constructor(private readonly tenants: FakeTenants) {}

  erase(tenantId: string): Promise<void> {
    this.calls.push({ tenantId });
    this.tenants.rows = this.tenants.rows.filter((row) => row.id !== tenantId);
    return Promise.resolve();
  }
}

/** The manual changes of the plan, in memory. */
export class FakeSubscriptionAdmin implements SubscriptionAdministrator {
  calls: { tenantId: string; planId: PlanId }[] = [];
  constructor(private readonly subscriptions: FakeSubscriptions) {}

  changePlan(
    tenantId: string,
    planId: PlanId,
  ): Promise<{
    previousPlanId: PlanId | null;
    planId: PlanId;
  }> {
    this.calls.push({ tenantId, planId });
    const row = this.subscriptions.rows.find((r) => r.tenantId === tenantId);
    const previousPlanId = row ? row.subscription.planId : null;
    if (row) {
      row.subscription = { ...row.subscription, planId };
    } else {
      this.subscriptions.rows.push({
        tenantId,
        subscription: aSubscription(planId),
      });
    }
    return Promise.resolve({ previousPlanId, planId });
  }
}

/** The metrics of the installation, in memory. */
export class FakeMetricsCache implements PlatformMetricsCache {
  private entry: CachedMetrics | null = null;
  sets = 0;

  get(): CachedMetrics | null {
    return this.entry;
  }

  set(metrics: PlatformMetrics): CachedMetrics {
    this.sets += 1;
    this.entry = {
      metrics,
      expiresAt: new Date(metrics.generatedAt.getTime() + 60_000),
    };
    return this.entry;
  }
}

/** The whole panel over in-memory adapters, with a fixed clock. */
export function buildPlatform(options: { now?: Date } = {}) {
  const now = options.now ?? NOW;
  const clock: Clock = { now: () => now };
  const tenants = new FakeTenants();
  const subscriptions = new FakeSubscriptions();
  const usage = new FakeUsage();
  const lifecycle = new FakeLifecycle(tenants);
  const tenantCache = new FakeTenantCache();
  const audit = new FakeAudit();
  const admin = new FakeSubscriptionAdmin(subscriptions);
  const metricsCache = new FakeMetricsCache();
  const eraser = new FakeEraser(tenants);
  return {
    now,
    clock,
    tenants,
    subscriptions,
    usage,
    lifecycle,
    tenantCache,
    audit,
    admin,
    metricsCache,
    eraser,
  };
}
