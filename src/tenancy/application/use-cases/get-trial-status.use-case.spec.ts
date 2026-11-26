import { Clock } from '../../../shared/application/clock.port';
import { TenantContext } from '../../../shared/application/tenant-context.port';
import { Tenant } from '../../domain/tenant';
import { TenantReader, TenantWriter } from '../ports/tenant.repository';
import { TenantBookingCounter } from '../ports/tenant-booking-counter.port';
import { TenantService } from '../tenant.service';
import { GetTrialStatusUseCase } from './get-trial-status.use-case';

const NOW = new Date('2026-11-25T10:00:00Z');
const clock: Clock = { now: () => NOW };

class Tenants implements TenantReader, TenantWriter {
  rows: Tenant[] = [];
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

const tenant = (over: Partial<Tenant>): Tenant => ({
  id: 'abc',
  slug: 'sur',
  name: 'Sur',
  status: 'active',
  isDefault: false,
  createdAt: NOW,
  trialEndsAt: null,
  bookingQuota: null,
  ...over,
});

function build(row: Tenant, bookings: number) {
  const tenants = new Tenants();
  tenants.rows.push(row);
  const counted: string[] = [];
  const counter: TenantBookingCounter = {
    count: (id) => {
      counted.push(id);
      return Promise.resolve(bookings);
    },
  };
  const context: TenantContext = {
    current: () => ({ id: row.id, slug: row.slug }),
  };
  return {
    counted,
    useCase: new GetTrialStatusUseCase(
      new TenantService(tenants, tenants, clock),
      context,
      counter,
      clock,
    ),
  };
}

describe('GetTrialStatusUseCase', () => {
  it('answers null, and counts nothing, for a business without a trial', async () => {
    const { useCase, counted } = build(tenant({}), 50);
    expect(await useCase.execute()).toEqual({ ok: true, value: null });
    expect(counted).toEqual([]);
  });

  it('answers the days left and the bookings made of the business in force', async () => {
    const endsAt = new Date(NOW.getTime() + 3 * 86_400_000);
    const { useCase, counted } = build(
      tenant({ trialEndsAt: endsAt, bookingQuota: 20 }),
      4,
    );
    expect(await useCase.execute()).toEqual({
      ok: true,
      value: {
        endsAt,
        daysLeft: 3,
        bookingsMade: 4,
        bookingQuota: 20,
        blocked: false,
      },
    });
    expect(counted).toEqual(['abc']);
  });

  it('is blocked when the quota is reached', async () => {
    const { useCase } = build(
      tenant({
        trialEndsAt: new Date(NOW.getTime() + 86_400_000),
        bookingQuota: 2,
      }),
      2,
    );
    const result = await useCase.execute();
    expect(result.ok && result.value?.blocked).toBe(true);
  });

  it('fails when the business is suspended', async () => {
    const { useCase } = build(tenant({ status: 'suspended' }), 0);
    const result = await useCase.execute();
    expect(result.ok).toBe(false);
  });
});
