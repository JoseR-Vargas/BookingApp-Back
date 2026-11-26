# Atlas free limits (spec 22)

The free Atlas tier has 0.5 GB of data and indexes, about 100 operations per
second shared by every business, no automatic backups, and it pauses the cluster
after 30 days without connections. This is how the app stays inside it.

## Defaults and environment variables

| What                         | Default            | Variable                           |
| ---------------------------- | ------------------ | ---------------------------------- |
| Availability cache (per process) | 60 s           | `AVAILABILITY_CACHE_TTL_SECONDS` (`0` turns it off) |
| Public requests per IP       | 120 per minute     | `PUBLIC_RATE_LIMIT_PER_MINUTE`     |
| Signup attempts per IP       | 5 per hour         | `SIGNUP_RATE_LIMIT_MAX`            |
| Storage quota of a new business | 50 MB (constant) | `DEFAULT_STORAGE_QUOTA_BYTES` in `src/tenancy/domain/storage.rules.ts` |
| Storage measurement reuse    | 10 min (constant)  | `STORAGE_MEASUREMENT_TTL_MS`       |

Tests that hammer the public routes (e2e) raise `PUBLIC_RATE_LIMIT_PER_MINUTE`.

## Availability cache

`GetAvailabilityUseCase` keeps each good answer for 60 s in the memory of the
process (`AvailabilityCache` port, `InMemoryAvailabilityCache`). The key is
**business + date + service ids (in order) + location**; entries are never shared
between businesses. Errors are never cached. The HTTP response does not change.

Invalidation is per business and happens after every write of the bookings
(`create`, `update`, `delete`, `cancelIfConfirmed`), of locations (including their
schedule), professionals and services (`invalidatingWriter` decorates the writer
ports in the modules). A read that was computing while a write happened does not
store its stale answer. Public settings (`/disponibilidad` on/off, days, published
services) are read on every request; only the per-day answers are cached.

With several instances each one has its own cache: a change made on another
instance can show up after at most one TTL (60 s). The booking itself is always
checked against the database, which stays the authority.

## Rate limit per IP

`GET /api/availability`, `GET /api/public-availability` and `POST /api/bookings`
share one sliding window per IP (`request.ip`), 120 per minute. Over the limit:
`429 { "statusCode": 429, "message": "Demasiadas peticiones. Intenta más tarde." }`.
Admin routes, the WhatsApp webhook and the rest are not limited (signup has its own
limit). Old keys are swept, so memory does not grow. It is per process; behind a
proxy set Express `trust proxy` or everybody shares one IP.

## Storage quota per business

A business created by the signup gets `storageQuotaBytes` = 50 MB; the default
business, `tenant:create` and older businesses have `null` (no cap). The size is
the sum of `$bsonSize` of the business's documents in the scoped collections
(photos and logos are what weigh). **Indexes are not counted** (Mongo reports them
per collection, not per business) and the bot collections are not scoped.
It is measured on demand when the panel reads `GET /api/admin/session` and reused
for 10 minutes (kept in `storageUsedBytes` / `storageMeasuredAt` of the `tenants`
record): no cron, one aggregation per scoped collection per business per 10 min.

```json
{ "storage": { "usedBytes": 36700160, "quotaBytes": 52428800, "percent": 70, "level": "warning" } }
```

`storage` is `null` without a cap. `level`: `ok` (<70 %), `warning` (>=70 %),
`critical` (>=90 %), `blocked` (>=100 %). When `blocked`, `POST /api/bookings` answers
`403 Este negocio alcanzó el límite de almacenamiento de su plan.` (website and bot)
and uploading a professional photo is refused with the same message. Removing
photos, cancelling, reading and the admin keep working so the owner can free space.

## Bot data retention

`processed_messages` (48 h on `createdAt`) and `conversation_states` (24 h on
`updatedAt`) already expire through TTL indexes defined in their schemas; both are
shorter than the 90 days of the spec, so they stay. `bookings` and the catalog
never expire. The tests check the index definitions (`listIndexes`); a test that
waits for the TTL monitor (runs every 60 s) would be slow and flaky.

## Backup and restore

Needs the MongoDB Database Tools (`mongodump`, `mongorestore`) and `MONGO_URI`
(in `.env` or the environment, naming the database).

```bash
npm run db:backup                         # dumps to backups/<date>_<time>
npm run db:restore -- backups/2026-11-26_100509 --yes
```

Both print the database they touch (credentials hidden). The backup refuses a
destination that exists; the restore needs `--yes`, replaces (`--drop`) only that
database's collections and refuses a folder without a dump of it. Try the restore
on a test database first. `backups/` holds customer data: do not commit it.

## Measure the real usage

Atlas UI: Cluster > Metrics (operations per second, data size). From a shell:
`db.stats()` in `mongosh`. A business's own size is in `tenants.storageUsedBytes`.

## The 30-day pause

Atlas pauses a free cluster after 30 days without connections. Resume it from the
Atlas UI (data is kept). A weekly uptime ping to `/health` keeps it awake only if
the app connects to the database; do a `db:backup` before leaving it idle.

## Checklist before migrating (schema or provider)

1. `npm run db:backup` and check that the folder has the database.
2. `npm run tenant:migrate -- --dry-run`.
3. Restore the dump on a `*_test` database and start the app on it.
4. Check `db.stats()` stays under 0.5 GB with indexes.
5. Run the migration, then the smoke checks, keep the backup.
