/**
 * Test-only wiring: the signup use case over in-memory adapters, with a fake
 * seeder, welcome and eraser, and the real account use cases.
 */
import { Clock } from '../shared/application/clock.port';
import { AdminSessionWriter } from '../auth/application/ports/admin-session.writer';
import { CreateAdminUserUseCase } from '../auth/application/use-cases/create-admin-user.use-case';
import { LoginAdminUseCase } from '../auth/application/use-cases/login-admin.use-case';
import { NodeSessionTokens } from '../auth/infrastructure/crypto/node-session-tokens';
import { InMemoryAdminSessionRepository } from '../auth/infrastructure/persistence/in-memory/in-memory-admin-session.repository';
import { InMemoryAdminUserRepository } from '../auth/infrastructure/persistence/in-memory/in-memory-admin-user.repository';
import { PasswordHasher } from '../auth/application/ports/password-hasher.port';
import { AsyncLocalStorageTenantContext } from '../shared/infrastructure/tenancy/async-local-storage-tenant-context';
import { TenantEraser } from '../tenancy/application/ports/tenant-eraser.port';
import {
  TenantReader,
  TenantWriter,
} from '../tenancy/application/ports/tenant.repository';
import { TenantService } from '../tenancy/application/tenant.service';
import { NewTenant, Tenant } from '../tenancy/domain/tenant';
import { BusinessSeeder } from './application/ports/business-seeder.port';
import {
  WelcomeMessage,
  WelcomeNotifier,
} from './application/ports/welcome-notifier.port';
import { ProvisionBusinessUseCase } from './application/use-cases/provision-business.use-case';
import { SignUpBusinessUseCase } from './application/use-cases/sign-up-business.use-case';

export const NOW = new Date('2026-11-25T10:00:00Z');
export const clock: Clock = { now: () => NOW };

export class Tenants implements TenantReader, TenantWriter {
  rows: Tenant[] = [
    {
      id: 'default',
      slug: 'principal',
      name: 'Principal',
      status: 'active',
      isDefault: true,
      createdAt: NOW,
      trialEndsAt: null,
      bookingQuota: null,
    },
  ];
  findBySlug(slug: string) {
    return Promise.resolve(this.rows.find((t) => t.slug === slug) ?? null);
  }
  findDefault() {
    return Promise.resolve(this.rows.find((t) => t.isDefault) ?? null);
  }
  insert(tenant: NewTenant) {
    const saved = { ...tenant, id: `id-${this.rows.length}` };
    this.rows.push(saved);
    return Promise.resolve(saved);
  }
}

/** Fast stand-in for scrypt. */
const hasher: PasswordHasher = {
  hash: (plain) => Promise.resolve(`h:${plain}`),
  verify: (plain, hash) => Promise.resolve(hash === `h:${plain}`),
};

export class Welcome implements WelcomeNotifier {
  sent: { message: WelcomeMessage; businessId: string }[] = [];
  constructor(private readonly context: AsyncLocalStorageTenantContext) {}
  send(message: WelcomeMessage) {
    this.sent.push({ message, businessId: this.context.current().id });
    return Promise.resolve();
  }
}

export function buildSignup() {
  const tenants = new Tenants();
  const context = new AsyncLocalStorageTenantContext();
  const users = new InMemoryAdminUserRepository();
  const sessions = new InMemoryAdminSessionRepository();
  const erased: string[] = [];
  const eraser: TenantEraser = {
    erase: (id) => {
      erased.push(id);
      tenants.rows = tenants.rows.filter((t) => t.id !== id);
      return Promise.resolve();
    },
  };
  const seeded: string[] = [];
  const seeder: BusinessSeeder & { failWith?: Error } = {
    seedBase: () => {
      if (seeder.failWith) return Promise.reject(seeder.failWith);
      seeded.push(context.current().id);
      return Promise.resolve();
    },
  };
  const welcome = new Welcome(context);
  const sessionWriter: { value: AdminSessionWriter } = { value: sessions };
  const createUser = new CreateAdminUserUseCase(users, hasher, clock);
  const login = new LoginAdminUseCase(
    users,
    users,
    { create: (s) => sessionWriter.value.create(s) } as AdminSessionWriter,
    hasher,
    new NodeSessionTokens(),
    clock,
  );
  const provision = new ProvisionBusinessUseCase(
    seeder,
    createUser,
    login,
    welcome,
  );
  const useCase = new SignUpBusinessUseCase(
    new TenantService(tenants, tenants, clock),
    provision,
    context,
    eraser,
    clock,
  );
  return {
    tenants,
    users,
    sessions,
    sessionWriter,
    erased,
    seeded,
    seeder,
    welcome,
    context,
    useCase,
  };
}
