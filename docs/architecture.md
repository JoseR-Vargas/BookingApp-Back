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

`src/architecture.spec.ts` enforces this for `src/shared` and for every module listed in
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

- `catalog` (spec 11, professionals, services, service selection and photos): same layout and
  `Result` rules; `locations`, schedules and public-availability settings stay in the old style
  until spec 12. `CatalogService` and `CatalogAdminService` are temporary facades (`@deprecated`)
  that wrap the use cases for `bookings`, `availability`, `admin` and the WhatsApp bot, and are
  deleted as each consumer migrates.

Modules that return `Result`: `RESULT_MODULES = ['branding', 'catalog']`.

Temporary ports (they read data owned by a module that has not migrated yet):

| Port | Adapter today | Replaced by |
| --- | --- | --- |
| `BookingActivity` | reads the bookings collection | spec 13 (`bookings`) |
| `LocationDirectory` | reads the locations collection | spec 12 (`locations`) |

Others (`availability`, `bookings`, `admin`, `auth`, `email`, `whatsapp`) still use the
previous style and are migrated one per spec. Do not extend the previous style in new code.

## Commands

- `npm test`: unit, use case, in-memory contract, HTTP and architecture tests (no database).
- `npm run test:int`: only `*.int.spec.ts`, against the Docker MongoDB `booking-e2e-mongo`
  (`mongodb://localhost:27018`, override with `TEST_MONGO_URI`). It uses the database
  `booking_int_test` only (a name that does not end with `_int_test` is refused), empties it between
  tests and fails with a clear message when MongoDB is unreachable: start it with
  `docker start booking-e2e-mongo`.
