# The panel of the owner of the system (spec 25)

Until now the owner of the system only had the database and the console. This
is the API of the panel that shows every business of the installation, its
state, its size and its use, and the actions the owner may do by hand.

The panel is a section of the existing admin panel with **its own key**:
`PLATFORM_API_KEY`. It is NOT the admin key of a business (`ADMIN_API_KEY`):
the two never open each other's routes, in either direction.

## The key

| Variable          | Meaning                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `PLATFORM_API_KEY` | The key of the owner. Without it (unset or blank) EVERY route of `/api/platform/*` answers `401`: the guard fails closed. It is compared in constant time. |

The key is sent in the header `x-platform-key`:

```bash
curl http://localhost:3000/api/platform/tenants -H 'x-platform-key: <PLATFORM_API_KEY>'
```

It is also accepted as `Authorization: Bearer <PLATFORM_API_KEY>` (the panel
may send it that way). Every failure answers the same `401`:

```json
{ "message": "Clave de plataforma inválida o ausente.", "error": "Unauthorized", "statusCode": 401 }
```

The admin key of a business answers `401` on these routes, and the platform
key answers `401` on the routes of a business (`/api/admin/*`). Both are
covered by the test suite.

## What the platform key can and cannot do

| It can                                                        | It cannot                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| Read the signals of every business (plan, state, size, use)  | Read the data of a client (no names, emails or phones)        |
| Count the bookings of every business (by professional, service and location) | Export the data of a business                      |
| Suspend a business (its routes answer `403`, nothing is deleted) | Charge a business (the gateway does, spec 23)          |
| Reactivate a business, extend its trial, change its plan by hand | Audit the changes of a business in detail              |
| Read the metrics of the installation                          | Read the metrics of a business inside the panel of its owner   |

## The routes

All of them are under `/api/platform` and all of them need the platform key.

### `GET /api/platform/tenants`

The list of the businesses of the installation.

```json
{
  "businesses": [
    {
      "id": "6a1b2c3d4e5f60718293a4b5",
      "slug": "barberia-sur",
      "name": "Barbería Sur",
      "status": "active",
      "plan": { "id": "pro", "name": "Pro" },
      "subscriptionStatus": "active",
      "trial": { "endsAt": "2026-12-09T10:00:00.000Z", "daysLeft": 14 },
      "bookingsThisMonth": 12,
      "storage": { "usedBytes": 1048576, "quotaBytes": 52428800 },
      "lastUseAt": "2026-11-25T09:00:00.000Z"
    }
  ]
}
```

| Field                | Meaning                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `id`                 | The id of the business (the `_id` of its document). It is the `:id` of the other routes.       |
| `slug`, `name`       | The business as it shows.                                                                     |
| `status`             | `active` or `suspended`.                                                                      |
| `plan`               | `{ id, name }` of the plan it pays; `null` when it has no subscription (spec 23).              |
| `subscriptionStatus` | `active`, `trialing`, `past_due` or `canceled`; `null` without a subscription. A subscription cancelled at the end of its period reads `canceled`. |
| `trial`              | `{ endsAt, daysLeft }` of the free trial (spec 21); `null` when the business has no trial. `daysLeft` rounds up and is `0` once the time is over. |
| `bookingsThisMonth`  | The bookings it created in the current calendar month (UTC), cancelled ones included.         |
| `storage`            | `{ usedBytes, quotaBytes }`: the size of its data at the last measurement and its cap (`null` = no cap, spec 22). |
| `lastUseAt`          | When it was used the last time: the date of its last booking. `null` when it has no bookings.  |

### `GET /api/platform/tenants/:id`

The same business plus the breakdown of its bookings of the current month.

```json
{
  "business": { "...": "the same object of the list" },
  "breakdown": {
    "professionals": [{ "id": "alex-garcia", "bookings": 8 }],
    "services": [{ "id": "corte", "bookings": 8 }],
    "locations": [{ "id": "principal", "bookings": 8 }],
    "catalog": { "professionals": 3, "services": 5, "locations": 2 }
  }
}
```

The breakdown counts only: the id and the number of bookings. No names, no
clients. `catalog` counts the professionals, the services and the locations
the business has (the active ones).

`404` `Negocio no encontrado.` when the id names no business.

### `POST /api/platform/tenants/:id/suspend`

The business stops answering requests: its own routes answer `403 Este negocio
no está disponible.` and **nothing is deleted**. The change is seen by the
very next request (the cached business is forgotten).

`200 { "business": { ... } }`.

It is refused when the business is the only one that answers:

- `409` `No se puede suspender el único negocio activo del sistema.`
- `409` `Este negocio ya está suspendido.`

### `POST /api/platform/tenants/:id/reactivate`

The business answers requests again. A trial that had expired starts again
(it lasts the same 14 days as the trial of the signup), which is what lets the
owner extend it afterwards.

`200 { "business": { ... } }`.

- `409` `Este negocio ya está activo.` (it answers already and its trial is running).
- `404` `Negocio no encontrado.`

### `POST /api/platform/tenants/:id/trial`

Body `{ "days": 7 }`: the days are added to `trialEndsAt` and the change is
recorded in the log of the system.

`200 { "business": { ... } }`.

- `400` `Los días de la prueba deben ser un número entero entre 1 y 365.`
- `409` `Este negocio no tiene una prueba gratuita para extender.`
- `409` `La prueba de este negocio ya venció: reactívalo antes de extenderla.`
- `404` `Negocio no encontrado.`

### `POST /api/platform/tenants/:id/plan`

Body `{ "planId": "pro" }`: a **manual** change of the plan. No gateway, no
charge: the subscription of the business becomes `active` with that plan (its
period is kept; without a subscription the change covers 30 days). The change
is recorded in the log of the system with the business, the old plan and the
new one.

`200 { "business": { ... } }`.

- `400` `El plan elegido no existe.`
- `409` `Este negocio ya está en el plan Pro.` (there is no change to record).
- `404` `Negocio no encontrado.`

### `GET /api/platform/metrics`

The metrics of the installation.

```json
{
  "businesses": { "total": 5, "active": 4, "inTrial": 2, "suspended": 1 },
  "bookings": { "today": 7, "thisMonth": 42 },
  "estimatedRevenueByPlan": [{ "planId": "pro", "subscriptions": 3 }],
  "generatedAt": "2026-11-26T10:00:00.000Z",
  "expiresAt": "2026-11-26T10:01:00.000Z"
}
```

- `businesses.inTrial` counts the businesses whose trial is still running.
- `bookings.today` counts the bookings created today (UTC) and
  `bookings.thisMonth` the ones created in the current calendar month (UTC).
  The count is by **creation**, like the usage of the plan (spec 23).
- `estimatedRevenueByPlan` counts the **active subscriptions** of each plan.
  It is an estimate, never a real charge: the gateway charges (spec 23). Only
  the plans with at least one active subscription are listed, in the order of
  the catalog of plans.
- `generatedAt` and `expiresAt` say how fresh the numbers are.

## The cache of the metrics

The metrics are computed once and kept in the memory of the process for a
minute, like the cache of the availability (spec 22): the free tier of Atlas
allows 100 operations per second and that is the real limit.

- Live time: 60 s (`PLATFORM_METRICS_CACHE_TTL_SECONDS` overrides it; `0`
  turns the cache off).
- Shape of the cache: **one entry per process**, `{ metrics, expiresAt }`,
  where `metrics` is the object above (without `expiresAt`) and `expiresAt` is
  the date it stops being fresh. There is no key: the metrics are global.
- With several instances each one has its own cache, so a change shows up
  after at most one live time.

The list of the businesses is NOT cached: it is one read of the businesses,
one of the subscriptions and one grouped read of the bookings.

## The log of the manual changes

Every manual action of the owner leaves a trace in the log of the system (the
`Logger` of the application, under the name `PlatformAudit`):

```
Cambio manual de plan del negocio 6a1b2c3d4e5f60718293a4b5: de gratis a pro.
Negocio 6a1b2c3d4e5f60718293a4b5 suspendido por el dueño del sistema.
Negocio 6a1b2c3d4e5f60718293a4b5 reactivado por el dueño del sistema.
Prueba del negocio 6a1b2c3d4e5f60718293a4b5 extendida: 7 días (nuevo límite 2026-12-05T10:00:00.000Z).
```

The log is not a table: the spec does not want a detailed audit of a business
("No: ... auditar cambios de un negocio en detalle"). The change of the plan
always names the business, the old plan and the new one.

## The tenancy of the panel

The panel reads across businesses, so it is the **only** caller allowed to do
it. Every read and every write it does goes through the explicit `unscoped`
escape of the tenancy module, with the reason written down (the escape is
auditable). The routes of the panel are exempt from the middleware of the
business (`/api/platform/*`): they have no business of their own and they must
answer even when the default business is suspended.

Because the request runs outside any business, a query that forgot its escape
fails closed (it answers `500`), exactly like every other query without a
business.

The queries are read only and aggregate: the collections `bookings`,
`professionals`, `services` and `locations` are read with the raw driver and
only counted. **The data of a client is never read**: no names, no emails, no
phones.

## Layers

`src/platform` (`MIGRATED_MODULES` and `RESULT_MODULES`):

- `domain/`: the rules of the panel (`platform.rules.ts`), the errors with
  their Spanish messages (`platform.errors.ts`), the model of the view
  (`platform-business.ts`, `platform-metrics.ts`, `platform-usage.ts`), the
  periods (`period.rules.ts`) and the rule of the key (`platform-key.rules.ts`).
- `application/`: the ports (`platform-usage`, `platform-metrics-cache`,
  `platform-audit`, `platform-credentials`), the reader of the signals
  (`platform-business-reader.ts`) and one use case per action.
- `infrastructure/`: the adapters (`MongoPlatformUsageReader`,
  `InMemoryPlatformMetricsCache`, `EnvPlatformCredentials`,
  `LoggingPlatformAudit`), the guard (`PlatformKeyGuard`) and the controllers.

`src/tenancy` grew the writer of the state of a business
(`TenantLifecycleWriter`) and the way to forget the cached business
(`TenantCacheInvalidator`). `src/billing` grew the directory of the
subscriptions and the manual change of the plan
(`SubscriptionDirectory`, `SubscriptionAdministrator`).
