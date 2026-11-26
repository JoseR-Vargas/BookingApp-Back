// ===== TENANT COMMAND LINE =====
// `npm run tenant:create -- --slug <slug> --name "<name>"` creates a business
// with its "Principal" location and schedule (no professionals or services).
// `npm run tenant:migrate [-- --dry-run]` runs the tenant migration, or only
// reports what it would change (spec 18).

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  TENANT_SCOPE,
  TenantScope,
} from '../shared/application/tenant-context.port';
import { CatalogSeeder } from '../catalog/infrastructure/persistence/mongo/catalog.seeder';
import { TenantService } from '../tenancy/application/tenant.service';
import { TenantMigration } from '../tenancy/infrastructure/migration/tenant-migration';

/** Reads `--key value` and `--flag` arguments. */
export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    if (command === 'migrate') {
      const report = await app.get(TenantMigration).run({
        dryRun: args['dry-run'] === true,
      });
      console.log(JSON.stringify(report, null, 2));
      return 0;
    }
    if (command === 'create') {
      if (typeof args.slug !== 'string' || typeof args.name !== 'string') {
        console.error('Usage: tenant:create -- --slug <slug> --name "<name>"');
        return 1;
      }
      const created = await app
        .get(TenantService)
        .create({ slug: args.slug, name: args.name });
      if (!created.ok) {
        console.error(created.error.message);
        return 1;
      }
      const tenant = created.value;
      await app
        .get<TenantScope>(TENANT_SCOPE)
        .run({ id: tenant.id, slug: tenant.slug }, () =>
          app.get(CatalogSeeder).seedBase(),
        );
      console.log(`Business "${tenant.slug}" created (${tenant.id}).`);
      return 0;
    }
    console.error('Unknown command. Use "create" or "migrate".');
    return 1;
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
