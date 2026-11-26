# Business signup and free trial (spec 21)

Anyone can create their own business without the owner of the system: one public
request creates the business, its base, its first `owner` and the session.

## `POST /api/signup`

Public: no guard and no `X-Tenant` (the business does not exist until the request
creates it, so `TenancyModule` exempts this one route from `TenantMiddleware`; a
suspended default business does not affect it).

```json
{
  "businessName": "Barbería Sur",
  "adminName": "Ana",
  "email": "ana@example.com",
  "password": "a-long-password",
  "slug": "barberia-sur"
}
```

`slug` is optional: without it (or empty) it is derived from the name
(`Barbería Sur` -> `barberia-sur`: lowercase, no accents, single dashes, up to 40
characters). If the name gives no valid slug (`!!`, or a reserved word) the answer
asks for one.

| Answer                                                            | When                                                                                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `201 { ok, tenant: {slug, name}, user }` + cookie `admin_session` | created; the cookie belongs to the NEW business (same flags as the login)                                                                                          |
| `400`                                                             | invalid business name, admin name, email (`El correo no es válido.`), weak password (`La contraseña debe tener al menos 10 caracteres.`), invalid or reserved slug |
| `409`                                                             | `El slug "x" ya está en uso.`                                                                                                                                      |
| `429`                                                             | `Demasiados intentos de alta desde esta conexión. Inténtalo de nuevo más tarde.`                                                                                   |

Rules and messages are the ones of the tenancy (slug) and of the admin accounts
(email, name, password, spec 20): `TenantService.create` and the existing
`CreateAdminUserUseCase` / `LoginAdminUseCase` are reused, not copied.

## What the business is born with

- `tenants`: `trialEndsAt = now + 14 days`, `bookingQuota = 20`
  (`src/tenancy/domain/trial.rules.ts`). Businesses made by `tenant:create`, the
  default one and every older business have `null` / `null`: no trial, never blocked.
- The same base as `tenant:create` (`CatalogSeeder.seedBase()`): the "Principal"
  location and the seed schedule. No professionals, no services, public availability off.
- One `owner` account and its session.
- A welcome email with the panel link (`<public url>/n/<slug>/login`).

## One operation, no leftovers

The local Mongo has no multi-document transactions, so the flow compensates:

1. validate the input (nothing is created when it is invalid);
2. create the business (outside any scope: `unscoped`);
3. inside `TenantScope.run` of the new business: seed, create the owner, open the session, welcome;
4. if step 3 fails (an `Err` or an exception), `TenantEraser.erase` deletes the business and
   every scoped document of it (`SCOPED_COLLECTIONS`) and the failure is answered as it was.

The welcome email is sent in the background: without `GMAIL_USER` / `GMAIL_APP_PASSWORD`, or
if the send fails, the signup still succeeds and only a warning is logged.

## Rate limit

`SignupRateLimiter` (port) with an in-memory sliding window per IP (`request.ip`): 5 attempts
per hour (failed ones count). `SIGNUP_RATE_LIMIT_MAX` overrides the 5 (tests, staging). It is
per process: several instances count on their own, and a restart forgets the counts. Behind a
proxy configure Express `trust proxy`, or every client shares the proxy's IP.

## Trial status

`GET /api/admin/session` with an account cookie answers `{ ok, user, trial }`; with the shared
key it is still exactly `{ ok: true }`.

```json
{
  "trial": {
    "endsAt": "2026-12-09T10:00:00.000Z",
    "daysLeft": 14,
    "bookingsMade": 3,
    "bookingQuota": 20,
    "blocked": false
  }
}
```

`trial` is `null` when the business has no trial. `daysLeft` rounds up and is `0` when the time
is over. `blocked` = time over OR `bookingsMade >= bookingQuota`. `bookingsMade` counts every
booking of the business (cancelled ones too; a deleted booking no longer counts).
The business record is cached for a minute by `TenantService`, the count is live.

## Storage quota (spec 22)

A business made by the signup also gets `storageQuotaBytes` = 50 MB; `GET /api/admin/session` adds
`storage: null | { usedBytes, quotaBytes, percent, level }` and at 100 % new bookings answer
`403 Este negocio alcanzó el límite de almacenamiento de su plan.` See [atlas-limits.md](./atlas-limits.md).

## Blocked business

`POST /api/bookings` (the website and the WhatsApp bot use the same `CreateBookingUseCase`)
answers `403 Este negocio alcanzó el límite de su prueba.` through the `TrialGate` port
(`TenancyTrialGate` asks `GetTrialStatusUseCase`). The check is the first thing the use case does.
Admin routes, catalog, availability reads, accounts and cancellation keep working.

## Layers

`src/signup` (`MIGRATED_MODULES` and `RESULT_MODULES`): `domain/signup.rules.ts`;
`application/` ports `BusinessSeeder`, `WelcomeNotifier`, `SignupRateLimiter`, use cases
`SignUpBusinessUseCase` (tenant + compensation) and `ProvisionBusinessUseCase` (seed, owner,
session, welcome); `infrastructure/` controller, in-memory limiter, catalog seeder adapter,
email welcome adapter. `src/tenancy` also joined both lists: `TenantEraser`,
`TenantBookingCounter`, `GetTrialStatusUseCase`, `trial.rules.ts`.
