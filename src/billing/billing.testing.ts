/**
 * Test-only wiring: the billing use cases over in-memory adapters, the fake
 * gateway, a fixed clock and a usage double.
 */
import { Clock } from '../shared/application/clock.port';
import { AsyncLocalStorageTenantContext } from '../shared/infrastructure/tenancy/async-local-storage-tenant-context';
import {
  TenantReader,
  TenantWriter,
} from '../tenancy/application/ports/tenant.repository';
import { TenantService } from '../tenancy/application/tenant.service';
import { Tenant } from '../tenancy/domain/tenant';
import { PlanUsageReader } from './application/ports/plan-usage.reader';
import { ApplyPaymentEventUseCase } from './application/use-cases/apply-payment-event.use-case';
import { CancelSubscriptionUseCase } from './application/use-cases/cancel-subscription.use-case';
import { CheckPlanLimitUseCase } from './application/use-cases/check-plan-limit.use-case';
import { GetSubscriptionStatusUseCase } from './application/use-cases/get-subscription-status.use-case';
import { HandlePaymentWebhookUseCase } from './application/use-cases/handle-payment-webhook.use-case';
import { ResumeSubscriptionUseCase } from './application/use-cases/resume-subscription.use-case';
import { StartCheckoutUseCase } from './application/use-cases/start-checkout.use-case';
import {
  FakePaymentGateway,
  signFakeWebhook,
} from './infrastructure/payment/fake-payment.gateway';
import { InMemoryPaymentEventLog } from './infrastructure/persistence/in-memory/in-memory-payment-event.log';
import { InMemorySubscriptionRepository } from './infrastructure/persistence/in-memory/in-memory-subscription.repository';

export const NOW = new Date('2026-11-25T10:00:00Z');
export const SECRET = 'billing-test-secret';

export class Tenants implements TenantReader, TenantWriter {
  rows: Tenant[] = ['sur', 'norte'].map((slug) => ({
    id: `id-${slug}`,
    slug,
    name: slug,
    status: 'active',
    isDefault: false,
    createdAt: NOW,
    trialEndsAt: null,
    bookingQuota: null,
    storageQuotaBytes: null,
    storageUsedBytes: 0,
    storageMeasuredAt: null,
  }));
  findBySlug(slug: string) {
    return Promise.resolve(this.rows.find((t) => t.slug === slug) ?? null);
  }
  findDefault() {
    return Promise.resolve(null);
  }
  insert(): Promise<Tenant> {
    return Promise.reject(new Error('not used'));
  }
}

/** What the business "has created", set by each test. */
export class FakeUsage implements PlanUsageReader {
  professionals = 0;
  locations = 0;
  bookings = 0;
  ranges: { start: Date; end: Date }[] = [];
  countProfessionals() {
    return Promise.resolve(this.professionals);
  }
  countLocations() {
    return Promise.resolve(this.locations);
  }
  countBookings(range: { start: Date; end: Date }) {
    this.ranges.push(range);
    return Promise.resolve(this.bookings);
  }
}

/** The raw body and signature the fake gateway would send. */
export function signedEvent(event: Record<string, unknown>, secret = SECRET) {
  const rawBody = JSON.stringify(event);
  return { rawBody, signature: signFakeWebhook(secret, rawBody) };
}

export function buildBilling(options: { now?: Date } = {}) {
  const time = { now: options.now ?? NOW };
  const clock: Clock = { now: () => time.now };
  const context = new AsyncLocalStorageTenantContext();
  const subscriptions = new InMemorySubscriptionRepository();
  const events = new InMemoryPaymentEventLog();
  const gateway = new FakePaymentGateway({
    secret: SECRET,
    checkoutBaseUrl: 'http://localhost:5173/plan/fake-checkout',
  });
  const usage = new FakeUsage();
  const tenants = new TenantService(new Tenants(), new Tenants(), clock);
  const apply = new ApplyPaymentEventUseCase(
    subscriptions,
    subscriptions,
    events,
    clock,
  );
  return {
    time,
    context,
    subscriptions,
    events,
    gateway,
    usage,
    /** Runs `fn` as the business `slug` (a request of its owner). */
    inBusiness: <T>(slug: string, fn: () => T): T =>
      context.run({ id: `id-${slug}`, slug, isDefault: false }, fn),
    status: new GetSubscriptionStatusUseCase(subscriptions, usage, clock),
    checkout: new StartCheckoutUseCase(gateway, context),
    cancel: new CancelSubscriptionUseCase(
      subscriptions,
      subscriptions,
      gateway,
      clock,
    ),
    resume: new ResumeSubscriptionUseCase(
      subscriptions,
      subscriptions,
      gateway,
      clock,
    ),
    gate: new CheckPlanLimitUseCase(subscriptions, usage, clock),
    apply,
    webhook: new HandlePaymentWebhookUseCase(gateway, tenants, context, apply),
  };
}
