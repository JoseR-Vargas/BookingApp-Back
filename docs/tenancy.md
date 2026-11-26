# Tenancy (one database, many businesses)

Every business (tenant) shares the same collections. A `tenantId` on each
document keeps them apart. Isolation is enforced by infrastructure, not by
each repository, so a forgotten filter cannot leak data.

## Model

- `tenants` collection: `slug` (unique), `name`, `status` (`active` or
  `suspended`), `isDefault`, `createdAt`, and the trial of spec 21
  (`trialEndsAt`, `bookingQuota`; both `null` = no trial). It has no `tenantId`.
- Scoped collections: `professionals`, `services`, `locations`,
  `business_settings`, `branding`, `bookings`, `admin_users`, `admin_sessions`
  (spec 20, see [admin-accounts.md](./admin-accounts.md)). Each declares
  `tenantId: ObjectId` and applies `tenantScopePlugin`.
- Unique indexes start with `tenantId` (`{tenantId, id}`, `{tenantId, key}`,
  and the booking slot index `{tenantId, professional.id, date, slots}`), so
  two businesses may share an id such as `alex-garcia`. The cancel-token index
  stays global.
- `admin_sessions` also has a TTL index on `expiresAt` (it cannot start with
  `tenantId`).
- The shared admin key can be turned off per business with
  `ADMIN_KEY_DISABLED_TENANTS` (slugs, comma separated) once it has an owner
  (`npm run admin:create`).
- The WhatsApp collections (`conversation_states`, `processed_messages`) are
  not scoped: the bot answers in the default business.

## Request flow

0. `POST /api/signup` is the one exempt route (spec 21): it has no business until
   it creates it, then runs the rest inside the new business's scope. See
   [signup.md](./signup.md).
1. `TenantMiddleware` reads the `X-Tenant` header. No header means the default
   business. Unknown or invalid slug: `404 Negocio no encontrado`. Suspended:
   `403 Este negocio no está disponible.`
2. The rest of the request runs inside an `AsyncLocalStorage` scope
   (`TenantContext` / `TenantScope` ports in `src/shared/application`).
3. The Mongoose plugin adds `tenantId` to every query, update, delete, count,
   distinct, exists and aggregate (a `$match` is prepended), and stamps it on
   every saved document. A query that names another tenant, or that runs with
   no scope at all, throws `TenantContextError`: it fails closed.
4. `unscoped(reason, fn)` is the only escape. Use it for the migration, the
   scripts and the tenant resolution itself.

Domain and application code never see the tenant: only adapters do.

## Commands

```bash
npm run tenant:create -- --slug barberia-sur --name "Barbería Sur"
npm run tenant:migrate -- --dry-run   # reports what would change, writes nothing
npm run tenant:migrate                 # runs the migration
```

`tenant:create` makes the business, its "Principal" location and its schedule
settings. It has no professionals or services. It rejects invalid, reserved
and duplicate slugs. The migration also runs at startup (before the seeders),
is idempotent, and swaps the old unique indexes for the tenant-first ones.

## Signup and trial (spec 21)

A business can also be created by itself: `POST /api/signup` makes the business
(`trialEndsAt` = +14 days, `bookingQuota` = 20), the same base as `tenant:create`, its
first `owner` and the session. A business whose trial is over (time or quota) answers
`403` to new bookings only. `tenant:create` keeps making businesses without a trial
(`null`/`null`). The failure of a signup deletes the business and its scoped data
(`TenantEraser`). Details in [signup.md](./signup.md).

## Backup and restore (Atlas free)

Atlas free has no automatic backups. Before any migration on real data:

```bash
mongodump --uri "$MONGO_URI" --out ~/Backups/booking-$(date +%F)
mongorestore --uri "$MONGO_URI" --drop ~/Backups/booking-YYYY-MM-DD/<db>
```

## Adding a new collection

1. Add `tenantId?: Types.ObjectId` (with `index: true`) to its schema.
2. Call `tenantScopePlugin(Schema)` right after `SchemaFactory.createForClass`.
3. Start every unique index with `tenantId`.
4. Add the collection to `SCOPED_COLLECTIONS` and `INDEX_PLANS` in
   `src/tenancy/infrastructure/migration/tenant-migration.ts`.
5. Integration tests run inside a business (`int-tenant-scope.setup.ts`); raw
   seeds must carry `TEST_TENANT_ID`.
