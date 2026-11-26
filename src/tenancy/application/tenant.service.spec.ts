import { Clock } from '../../shared/application/clock.port';
import { NewTenant, Tenant } from '../domain/tenant';
import { TenantReader, TenantWriter } from './ports/tenant.repository';
import { TenantService } from './tenant.service';

class InMemoryTenants implements TenantReader, TenantWriter {
  readonly rows: Tenant[] = [];

  findBySlug(slug: string): Promise<Tenant | null> {
    return Promise.resolve(this.rows.find((t) => t.slug === slug) ?? null);
  }

  findDefault(): Promise<Tenant | null> {
    return Promise.resolve(this.rows.find((t) => t.isDefault) ?? null);
  }

  insert(tenant: NewTenant): Promise<Tenant> {
    const saved = { ...tenant, id: `id-${this.rows.length + 1}` };
    this.rows.push(saved);
    return Promise.resolve(saved);
  }
}

const clock: Clock = { now: () => new Date('2026-11-25T10:00:00Z') };

describe('TenantService.create', () => {
  let tenants: InMemoryTenants;
  let service: TenantService;

  beforeEach(() => {
    tenants = new InMemoryTenants();
    service = new TenantService(tenants, tenants, clock);
  });

  it('creates an active, non-default business with a normalized slug', async () => {
    const result = await service.create({
      slug: ' Barberia-Sur ',
      name: 'Sur',
    });
    expect(result.ok).toBe(true);
    expect(tenants.rows[0]).toMatchObject({
      slug: 'barberia-sur',
      name: 'Sur',
      status: 'active',
      isDefault: false,
      createdAt: clock.now(),
      trialEndsAt: null,
      bookingQuota: null,
    });
  });

  it('stores the trial it is given, and none by default', async () => {
    const trialEndsAt = new Date('2026-12-09T10:00:00Z');
    await service.create({
      slug: 'con-prueba',
      name: 'Con prueba',
      trial: { trialEndsAt, bookingQuota: 20 },
    });
    expect(tenants.rows[0]).toMatchObject({ trialEndsAt, bookingQuota: 20 });
  });

  it('rejects an invalid slug', async () => {
    const result = await service.create({ slug: 'a', name: 'X' });
    expect(result.ok).toBe(false);
    expect(tenants.rows).toHaveLength(0);
  });

  it('rejects a reserved slug', async () => {
    const result = await service.create({ slug: 'admin', name: 'X' });
    expect(result.ok).toBe(false);
  });

  it('rejects an empty name', async () => {
    const result = await service.create({ slug: 'valid-slug', name: '  ' });
    expect(result.ok).toBe(false);
  });

  it('rejects a duplicate slug', async () => {
    await service.create({ slug: 'valid-slug', name: 'A' });
    const result = await service.create({ slug: 'valid-slug', name: 'B' });
    expect(result.ok).toBe(false);
    expect(tenants.rows).toHaveLength(1);
  });
});
