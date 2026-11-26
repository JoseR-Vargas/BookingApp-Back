# Architecture: light hexagonal

Goal: the business rules and the use cases never know which database, framework or provider sits
behind them. Replacing MongoDB means writing new adapters and changing one binding per module.

## Layers (per module)

```
src/<module>/
  domain/            business rules, domain models, domain errors. Pure TypeScript.
  application/       ports (interfaces + injection tokens) and use cases.
  infrastructure/    everything that touches the outside: database, HTTP, email, sockets.
  <module>.module.ts composition root: binds each port token to an adapter.
src/shared/          kernel: DomainError, Result, the filter and `respond` that turn a failure into an HTTP answer.
```

Imports go inward only: `infrastructure -> application -> domain`.

| Layer            | May import                                                          | Must not import                                                                                         |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `domain`         | other `domain`, `shared/domain`                                     | `@nestjs/*`, `mongoose`, HTTP, `process.env`, `new Date()`, `application`, `infrastructure`             |
| `application`    | `domain`, `shared/domain`; from Nest only `Injectable` and `Inject` | `mongoose`, `@nestjs/mongoose`, `@nestjs/platform-express`, `socket.io`, `nodemailer`, `infrastructure` |
| `infrastructure` | anything inward, plus the SDKs it adapts                            | other modules' `infrastructure`                                                                         |

`src/architecture.spec.ts` enforces this for `src/shared` (which includes the pure schedule core
`src/shared/domain/schedule`, also `throw`-free) and for every module listed in
`MIGRATED_MODULES`. A module joins the list in the spec that migrates it. Modules in
`RESULT_MODULES` (`src/architecture/result-modules.ts`) must also be `throw`-free in `domain/` and
`application/use-cases/` (see "Errors as values").

## Building blocks

- **Domain model**: plain objects/classes of the business, never a Mongoose document.
- **Domain error**: extends `DomainError` with a semantic `kind` (`validation`, `not-found`,
  `conflict`, `forbidden`). It never mentions HTTP. `DomainErrorFilter` (registered in
  `configureApp`) sends the same status and body as the matching Nest exception.
- **Port**: a small interface plus a `Symbol` token, owned by `application/ports`. Split reads
  and writes (`XReader`, `XWriter`) so a consumer depends only on what it uses. Inject
  `Clock`, id generators and configuration as ports: no `new Date()` or `process.env` in a use case.
- **Use case**: one class, one `execute`, constructor-injected ports; returns a `Result`.
- **Adapter**: an `infrastructure` class that implements a port by wrapping an SDK (composition,
  no base classes). Persistence adapters use an entity (schema) and a mapper (entity <-> domain);
  entities never leave their folder.
- **Controller + input DTO**: HTTP shape and size validation, then a call to a use case.
- **Composition root**: `<module>.module.ts` binds `{ provide: TOKEN, useClass: Adapter }`.

## Errors as values

A failure is one of two kinds, and each travels differently:

| Failure                                      | Travels as                           | Ends as         |
| -------------------------------------------- | ------------------------------------ | --------------- |
| Business (invalid data, not found, conflict) | `Err(DomainError)` inside a `Result` | 400/404/409/403 |
| Infrastructure (database down, network)      | an exception, thrown by the adapter  | 500             |

- `Result<T, E extends DomainError>` (`src/shared/domain/result.ts`) is a union discriminated by
  `ok`: `Ok { ok: true, value }` or `Err { ok: false, error }`. Narrow with `if (r.ok)` before
  reading `value`. Helpers: `ok`, `err`, `map`, `andThen`, `mapErr`, `match`, `unwrapOr`; none throws.
- Domain rules return `Result<Model, XError>`. Use cases return `Promise<Result<T, DomainError>>`
  and stop at the first `Err` (`if (!r.ok) return r`). Neither contains `throw`.
- Ports do not change: absence is `null`, infrastructure failures throw. A use case turns a
  `null` into `err(new NotFoundError())` when absence is a business failure.
- The HTTP edge calls `respond(result)` (`src/shared/infrastructure/http/respond.ts`): it returns
  the value or throws the `DomainError`, and `DomainErrorFilter` formats it. That is the only
  place a business error becomes an exception. Any other exception is not a `DomainError` and
  reaches Nest as a 500.
- The architecture test rejects `throw` (found in the TypeScript AST, not in text) in `domain/`
  and `application/use-cases/` of every module in `RESULT_MODULES`. Ports and `infrastructure/`
  may throw.

## Add a module

1. Write the rule in `domain/` and its failure as a domain error.
2. Define the port the use case needs.
3. Write the use case against the port.
4. Write the in-memory adapter and a contract suite for the port.
5. Write the real adapter (entity, mapper, repository) and make it pass the same suite.
6. Controller and DTO call the use case; wire everything in the module.
7. Add the module to `MIGRATED_MODULES` and to `RESULT_MODULES`.

## Swap the database

1. Create `infrastructure/persistence/<new-db>/` with an adapter per port.
2. Run each port's contract suite against it: it must pass unchanged.
3. Change the binding in `<module>.module.ts`.
4. Domain and use cases are untouched. If one had to change, the boundary was wrong: fix the
   boundary, not the use case.

## Tests

| What         | How                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Domain rules | Pure unit tests, no mocks                                                                                                |
| Use cases    | In-memory adapters                                                                                                       |
| Adapters     | One contract suite per port, run against every adapter (`npm test` for memory, `npm run test:int` for MongoDB in Docker) |
| HTTP         | Supertest over the module with its real or in-memory adapter                                                             |

## Status

Migrated modules are listed in `src/architecture/migrated-modules.ts` (`MIGRATED_MODULES`):

- `branding` (spec 09): the reference module. Domain rules and errors, ports `BrandingReader`,
  `BrandingWriter` and `Clock`, one use case per action, a MongoDB adapter and an in-memory
  adapter that pass the same contract suite, and thin controllers with input DTOs and a presenter.
  Its HTTP suite runs over the in-memory adapter, which proves the database can be swapped
  without touching the domain or the use cases. Spec 10 made its rules and use cases return
  `Result` (listed in `RESULT_MODULES`); the HTTP answers did not change.

- `catalog` (spec 11: professionals, services, service selection and photos; spec 12: locations,
  schedules, public-availability settings and the migration to "Principal"): same layout and
  `Result` rules. The schedule model and its pure rules live in `src/shared/domain/schedule/`, the
  shared core that `catalog` and `availability` both import (so neither depends on the other).
  `CatalogService` and `CatalogAdminService` are temporary facades (`@deprecated`) that wrap the
  use cases for `bookings`, `availability`, `admin` and the WhatsApp bot, and are deleted as each
  consumer migrates. See [locations.md](./locations.md).

- `availability` (spec 13: availability of a day and the public view): domain rules (`occupancy`,
  `day-availability`, `public-view`) and errors, ports `OccupiedSlotsReader`, `CatalogLookup` and
  `BusinessClock`, use cases `GetAvailability` and `GetPublicAvailability`, and controllers with the
  same routes and answers as before. `AvailabilityService` is a temporary facade (`@deprecated`)
  that wraps `GetAvailability` for the WhatsApp bot, and `availability.calculator.ts` only
  re-exports the rules for `bookings`, `admin` and the bot. The module imports nothing from
  `whatsapp`: "today" and the current time come from `BusinessClock` (`SystemBusinessClock`, which
  reads `BUSINESS_TIMEZONE`).

- `auth` (spec 20: admin accounts, sessions and roles): domain rules and errors, ports for
  users, sessions, password hashing and session tokens, one use case per action, in-memory and
  MongoDB adapters that pass the same contract suites, and the guard that accepts the session
  cookie or the legacy key. See [admin-accounts.md](./admin-accounts.md).

- `billing` (spec 23: plans, subscription state machine, plan limits, payment gateway port with a fake adapter, signed idempotent webhook): see [billing.md](./billing.md). Listed in `MIGRATED_MODULES` and `RESULT_MODULES`.

- `reminders` (spec 24: the reminder of a booking before its appointment): domain rules (which
  bookings are due, which window, whether it was already sent, which channels apply and the
  markers of the template), ports `MessageSender` (the WhatsApp client of `whatsapp` and the
  mailer of `email` behind it), `BusinessTime` (the clock of the business, `BUSINESS_TIMEZONE`)
  and `ReminderPlan` (the limits of the plan of spec 23), the use cases `SendDueReminders` and
  `SendReminder` (the log of what was sent lives in the booking, so the idempotency does not
  depend on another service) and the scheduler that runs every X minutes
  (`REMINDERS_INTERVAL_MINUTES`), one business at a time inside its own scope. The settings of
  the business live in the `tenants` collection and its ports are in `tenancy`. See
  [reminders.md](./reminders.md). Listed in `MIGRATED_MODULES` and `RESULT_MODULES`.

Modules that return `Result`: `RESULT_MODULES = ['branding', 'catalog', 'availability', 'auth', 'signup', 'tenancy', 'billing', 'reminders']`.

Temporary ports (they read data owned by a module that has not migrated yet):

| Port | Adapter today | Replaced by |
| --- | --- | --- |
| `BookingActivity` | reads the bookings collection | spec 14 (`bookings`) |
| `OccupiedSlotsReader` | `MongoOccupiedSlotsReader` reads the bookings collection through the `Booking` schema | spec 14 (`bookings`) |
| `CatalogLookup` | `CatalogFacadeLookup` wraps the temporary `CatalogService` facade | when the facade is deleted (specs 17 and 26) |

Other temporary crossings: the catalog's schedule controller counts the bookings a schedule leaves
out of hours with `ScheduleImpactService` (`src/admin/schedule-impact.ts`), which stays in `admin`
until spec 14; and `src/catalog/locations.ts` keeps `LocationNotFoundError` for `bookings` and the
`AvailabilityService` facade until they migrate.

Others (`bookings`, `admin`, `auth`, `email`, `whatsapp`) still use the
previous style and are migrated one per spec. Do not extend the previous style in new code.

## Commands

- `npm test`: unit, use case, in-memory contract, HTTP and architecture tests (no database).
- `npm run test:int`: only `*.int.spec.ts`, against the Docker MongoDB `booking-e2e-mongo`
  (`mongodb://localhost:27018`, override with `TEST_MONGO_URI`). It uses the database
  `booking_int_test` only (a name that does not end with `_int_test` is refused), empties it between
  tests and fails with a clear message when MongoDB is unreachable: start it with
  `docker start booking-e2e-mongo`.

## Tenant context (spec 18)

The business a request belongs to travels through the `TenantContext` and
`TenantScope` ports (`src/shared/application/tenant-context.port.ts`), backed
by an `AsyncLocalStorage` adapter. Domain and application code never read it:
only adapters do.

- The HTTP edge (`TenantMiddleware`) opens the scope from the `X-Tenant`
  header; no header means the default business.
- The `tenantScopePlugin` (`src/shared/infrastructure/mongo`) filters every
  Mongoose operation by `tenantId` and stamps it on every stored document. It
  fails closed: with no business in the context it throws.
- `unscoped(reason, fn)` is the only escape (migration, scripts, tenant
  resolution).
- The WebSocket handshake needs the admin credentials and joins the room
  `tenant:<tenantId>`; notifications go to that room only.

See `docs/tenancy.md` for the model, the commands and how to add a collection.

## Atlas limits (spec 22)

Cross-cutting pieces for the free Atlas tier, all behind ports: `RateLimiter`
(`PUBLIC_RATE_LIMITER`, sliding window, `PublicRateLimitGuard` on the three public
routes), `AvailabilityCache` (+ `AvailabilityInvalidator`, applied to the writer
ports by `invalidatingWriter` in the module files), `TenantStorageMeter` /
`TenantStorageStore` / `StorageGate` (storage quota). `src/scripts/db-backup.ts`
wraps `mongodump` / `mongorestore`. See `docs/atlas-limits.md`.
