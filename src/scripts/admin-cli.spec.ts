import { Clock } from '../shared/application/clock.port';
import { Tenant } from '../shared/application/tenant-context.port';
import { err, ok } from '../shared/domain/result';
import { CreateAdminUserUseCase } from '../auth/application/use-cases/create-admin-user.use-case';
import { ScryptPasswordHasher } from '../auth/infrastructure/crypto/scrypt-password-hasher';
import { InMemoryAdminUserRepository } from '../auth/infrastructure/persistence/in-memory/in-memory-admin-user.repository';
import { TenantNotFound } from '../tenancy/domain/tenant.errors';
import { tenantScopeStorage } from '../shared/infrastructure/tenancy/tenant-scope.storage';
import { ADMIN_CREATE_USAGE, AdminCreateDeps, createOwner } from './admin-cli';

const clock: Clock = { now: () => new Date('2026-11-25T10:00:00Z') };

describe('admin:create', () => {
  let users: InMemoryAdminUserRepository;
  let deps: AdminCreateDeps;
  const tenants: Tenant[] = [
    { id: 'tenant-a', slug: 'barberia-sur' },
    { id: 'tenant-b', slug: 'spa-norte' },
  ];

  beforeEach(() => {
    users = new InMemoryAdminUserRepository();
    const create = new CreateAdminUserUseCase(
      users,
      new ScryptPasswordHasher(),
      clock,
    );
    deps = {
      resolveTenant: (slug) => {
        const found = tenants.find((t) => t.slug === slug);
        return Promise.resolve(found ? ok(found) : err(new TenantNotFound()));
      },
      inTenant: (tenant, fn) =>
        tenantScopeStorage.run({ tenantId: tenant.id, slug: tenant.slug }, fn),
      createUser: (draft) => create.execute(draft),
    };
  });

  const inTenant = <T>(id: string, fn: () => Promise<T>) =>
    tenantScopeStorage.run({ tenantId: id }, fn);

  it('creates the first owner inside the named business only', async () => {
    const result = await createOwner(
      {
        tenant: 'barberia-sur',
        email: 'Ana@Example.com',
        name: 'Ana',
        password: 'a-long-password',
      },
      deps,
    );
    expect(result.code).toBe(0);
    expect(result.message).toContain('ana@example.com');
    expect(result.message).toContain('ADMIN_KEY_DISABLED_TENANTS');
    expect(result.message).not.toContain('a-long-password');
    const a = await inTenant('tenant-a', () => users.list());
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ email: 'ana@example.com', role: 'owner' });
    await expect(inTenant('tenant-b', () => users.list())).resolves.toEqual([]);
  });

  it.each<[string, Record<string, string | true>]>([
    ['no arguments', {}],
    [
      'a missing tenant',
      { email: 'a@b.co', name: 'A', password: 'a-long-password' },
    ],
    [
      'a flag without value',
      {
        tenant: 'barberia-sur',
        email: true as const,
        name: 'A',
        password: 'a-long-password',
      },
    ],
  ])('prints the usage and exits 1 with %s', async (_label, args) => {
    await expect(createOwner(args, deps)).resolves.toEqual({
      code: 1,
      message: ADMIN_CREATE_USAGE,
    });
  });

  it('exits 1 for an unknown business and creates nothing', async () => {
    const result = await createOwner(
      {
        tenant: 'nope',
        email: 'a@b.co',
        name: 'A',
        password: 'a-long-password',
      },
      deps,
    );
    expect(result.code).toBe(1);
    await expect(inTenant('tenant-a', () => users.list())).resolves.toEqual([]);
  });

  it('exits 1 with the rule message for a short password or a repeated email', async () => {
    const short = await createOwner(
      { tenant: 'barberia-sur', email: 'a@b.co', name: 'A', password: 'short' },
      deps,
    );
    expect(short).toEqual({
      code: 1,
      message: 'La contraseña debe tener al menos 10 caracteres.',
    });
    const args = {
      tenant: 'barberia-sur',
      email: 'a@b.co',
      name: 'A',
      password: 'a-long-password',
    };
    expect((await createOwner(args, deps)).code).toBe(0);
    expect(await createOwner(args, deps)).toEqual({
      code: 1,
      message: 'Ya existe un usuario con ese correo.',
    });
  });
});
