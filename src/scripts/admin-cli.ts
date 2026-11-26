// ===== ADMIN COMMAND LINE =====
// `npm run admin:create -- --tenant <slug> --email <email> --name <name> --password <password>`
// creates the first owner of a business (spec 20). Further accounts are
// created by that owner from the panel.

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { CreateAdminUserUseCase } from '../auth/application/use-cases/create-admin-user.use-case';
import { AdminUser } from '../auth/domain/admin-user';
import {
  TENANT_SCOPE,
  Tenant,
  TenantScope,
} from '../shared/application/tenant-context.port';
import { Result } from '../shared/domain/result';
import { TenantService } from '../tenancy/application/tenant.service';
import { parseArgs } from './tenant-cli';

export const ADMIN_CREATE_USAGE =
  'Usage: admin:create -- --tenant <slug> --email <email> --name <name> --password <password>';

/** What `createOwner` needs from the application, so it runs without a database in tests. */
export interface AdminCreateDeps {
  resolveTenant(slug: string): Promise<Result<Tenant>>;
  /** Runs `fn` inside the business, like a request does. */
  inTenant<T>(tenant: Tenant, fn: () => Promise<T>): Promise<T>;
  createUser(draft: {
    email: string;
    name: string;
    password: string;
    role: 'owner';
  }): Promise<Result<AdminUser>>;
}

/** Creates the first owner of a business. Answers the exit code and the line to print. */
export async function createOwner(
  args: Record<string, string | true>,
  deps: AdminCreateDeps,
): Promise<{ code: number; message: string }> {
  const { tenant: slug, email, name, password } = args;
  if (
    typeof slug !== 'string' ||
    typeof email !== 'string' ||
    typeof name !== 'string' ||
    typeof password !== 'string'
  ) {
    return { code: 1, message: ADMIN_CREATE_USAGE };
  }
  const tenant = await deps.resolveTenant(slug);
  if (!tenant.ok) return { code: 1, message: tenant.error.message };
  const created = await deps.inTenant(tenant.value, () =>
    deps.createUser({ email, name, password, role: 'owner' }),
  );
  if (!created.ok) return { code: 1, message: created.error.message };
  return {
    code: 0,
    message:
      `Owner ${created.value.email} created in "${tenant.value.slug}". ` +
      `To turn off the shared admin key for this business, add "${tenant.value.slug}" to ADMIN_KEY_DISABLED_TENANTS.`,
  };
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'create') {
    console.error('Unknown command. Use "create".');
    return 1;
  }
  const args = parseArgs(rest);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    const scope = app.get<TenantScope>(TENANT_SCOPE);
    const tenants = app.get(TenantService);
    const users = app.get(CreateAdminUserUseCase);
    const { code, message } = await createOwner(args, {
      resolveTenant: (slug) => tenants.resolve(slug),
      inTenant: (tenant, fn) => scope.run(tenant, fn),
      createUser: (draft) => users.execute(draft),
    });
    (code === 0 ? console.log : console.error)(message);
    return code;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
