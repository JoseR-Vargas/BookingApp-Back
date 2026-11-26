# Plans and billing (spec 23)

A business that contracted a plan has its limits; the payment gateway charges and
the backend only keeps the state and the period. The gateway is behind a port
(`PaymentGateway`), so the code does not depend on any provider.

## Plans

Plans live in code, not in the database (`src/billing/domain/plans.ts`): they change
without a migration and the owner of the system sets them.

|                      | `gratis` | `pro` | `negocio` |
| -------------------- | -------- | ----- | --------- |
| Professionals        | 1        | 3     | 10        |
| Locations            | 1        | 2     | 5         |
| Bookings per month   | 50       | 500   | 2000      |
| Public page          | no       | yes   | yes       |
| Reminders (spec 24)  | no       | yes   | yes       |

`publicPage` and `reminders` are reported in the API but not enforced by spec 23.

**A business with NO `subscriptions` record behaves exactly as before** (trial of spec 21,
storage of spec 22, no plan limits). The limits of `gratis` do not apply to the default
business nor to any older one: a plan governs a business only once it has a subscription.
A subscription replaces the trial: a business that pays is not blocked by its old trial quota
(the storage quota still applies).

## Subscription and state machine

`subscriptions` (tenant-scoped, one per business: unique `{tenantId}` and `{tenantId, status}`):
`planId`, `status` (`trialing | active | past_due | canceled`), `currentPeriodEnd`,
`cancelAtPeriodEnd`, `externalPaymentId`, `createdAt`, `updatedAt`.

Pure rules in `src/billing/domain/subscription.rules.ts`:

| Event / action                   | Transition                                                            |
| -------------------------------- | --------------------------------------------------------------------- |
| `payment.succeeded`              | none / trialing / active / past_due / canceled -> `active` (plan + period; clears a pending cancellation) |
| `subscription.trial_started`     | none / canceled -> `trialing`                                         |
| `payment.failed`                 | trialing / active -> `past_due` (past_due stays; canceled is ignored) |
| `subscription.canceled`          | trialing / active / past_due -> `canceled`                            |
| owner cancels                    | sets `cancelAtPeriodEnd` (status unchanged; twice = no-op)            |
| owner resumes                    | clears `cancelAtPeriodEnd` while the period runs                      |

`effectiveStatus`: a subscription with `cancelAtPeriodEnd` whose `currentPeriodEnd` has passed
reads `canceled` (no cron needed). An active subscription past its period without a
cancellation stays active: the webhook may be late.

## What is limited, and what never is

Checked by the `PlanGate` port (`src/shared/application/plan-gate.port.ts`), implemented by
billing and asked by the use cases that create things:

- `CreateProfessionalUseCase`: active professionals;
- `CreateLocationUseCase`: active locations;
- `CreateBookingUseCase`: bookings created in the current calendar month (UTC) by the business,
  cancelled ones included; and a `canceled` subscription refuses new bookings.

Over a limit the answer is `403` with a Spanish message naming the limit and the plan that
solves it, e.g. `Alcanzaste el límite de profesionales del plan Gratis (1 profesional). Contrata el plan Pro (hasta 3 profesionales) para ampliarlo.`
(on the biggest plan: `... Contacta con soporte para ampliarlo.`). A canceled subscription answers
`La suscripción de este negocio terminó: no se aceptan reservas nuevas hasta que contrates un plan.`

Never blocked: availability, every read, the panel, existing bookings and their cancellation.
`past_due` keeps accepting bookings; only a `canceled` subscription stops new ones.

## API

Owner only (`@Roles('owner')`; the legacy admin key counts as owner):

- `GET /api/admin/subscription` -> `200`

  ```json
  {
    "plans": [
      { "id": "gratis", "name": "Gratis", "limits": { "professionals": 1, "locations": 1, "bookingsPerMonth": 50, "publicPage": false, "reminders": false } },
      { "id": "pro", "name": "Pro", "limits": { "professionals": 3, "locations": 2, "bookingsPerMonth": 500, "publicPage": true, "reminders": true } },
      { "id": "negocio", "name": "Negocio", "limits": { "professionals": 10, "locations": 5, "bookingsPerMonth": 2000, "publicPage": true, "reminders": true } }
    ],
    "subscription": null
  }
  ```

  `subscription` is `null` without a subscription, or
  `{ planId, status, currentPeriodEnd (ISO), cancelAtPeriodEnd, limits, usage: { professionals, locations, bookingsThisMonth } }`
  (`status` already reads `canceled` once a pending cancellation reached its period end).
- `POST /api/admin/subscription/checkout` body `{ "planId": "pro" }` -> `200 { "checkoutUrl": "..." }`.
  `400` `El plan elegido no existe.` or, for `gratis`, `El plan Gratis no requiere pago: elige un plan de pago.`
  Nothing is stored until the gateway confirms.
- `POST /api/admin/subscription/cancel` and `POST /api/admin/subscription/resume` -> `200` with the same
  body as `GET`. `404` without a subscription; `409` when it does not apply (already canceled, nothing
  pending to resume, period over).
- `GET /api/admin/session` (account sessions) gains `plan: null | { planId, status, currentPeriodEnd, cancelAtPeriodEnd, limits, usage }`.
  The answer with the shared key stays exactly `{ "ok": true }`.

Public: `POST /api/webhooks/payments`, header `x-payment-signature`. No guard and no `X-Tenant`
(`TenancyModule` exempts the route; the business comes from the event's `tenantSlug` and the rest runs
inside `TenantScope.run`). The signature is verified over the RAW body before anything else.

| Answer                                  | When                                                        |
| --------------------------------------- | ----------------------------------------------------------- |
| `200 { ok: true, outcome: "processed" }` | the subscription changed                                    |
| `200 { ok: true, outcome: "ignored" }`   | valid event that does not apply (unknown type, `payment.failed` without a subscription) |
| `200 { ok: true, outcome: "duplicate" }` | the event id was already processed: nothing changes         |
| `401`                                   | missing or invalid signature (logged as a warning, nothing stored) |
| `400`                                   | signed body that is not an event, or `payment.succeeded` without `planId` |
| `404`                                   | the event names an unknown business                         |

Idempotency: `payment_events` keeps `{ externalEventId (unique), type, processedAt }`. It is the one
**global** (not tenant-scoped) collection of this spec: the webhook must know whether it saw an event before it
knows the business, and the event id is unique at the gateway. It is not in `SCOPED_COLLECTIONS`.

## Payment gateway port and adapters

`PaymentGateway` (`src/billing/application/ports/payment-gateway.port.ts`): `createCheckout`,
`verifySignature(rawBody, signature)`, `parseEvent(rawBody)`, `cancelAtPeriodEnd`, `resume`.

The adapter is chosen when the application starts by `PAYMENT_GATEWAY` (default `fake`). An unknown value
fails at startup: `PAYMENT_GATEWAY="x" is not supported. Supported values: fake.` A real provider adds an adapter in
`src/billing/infrastructure/payment/` and one entry in `payment-gateway.factory.ts`; no use case changes.

| Variable                    | Meaning                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `PAYMENT_GATEWAY`           | `fake` (default)                                                                      |
| `PAYMENT_WEBHOOK_SECRET`    | HMAC secret of the webhooks. Required when `NODE_ENV=production`; a fixed dev secret otherwise |
| `PAYMENT_FAKE_CHECKOUT_URL` | the local page the fake checkout link points to (default `http://localhost:5173/plan/fake-checkout`) |

### The fake gateway (development, e2e, tests)

Deterministic and with no network. `checkoutUrl` is
`<PAYMENT_FAKE_CHECKOUT_URL>?payment=fake_pay_<slug>_<planId>&plan=<planId>&tenant=<slug>`.
"Paying" is posting a signed event; the signature is the hex HMAC-SHA256 of the raw body:

```bash
BODY='{"id":"evt_1","type":"payment.succeeded","tenantSlug":"barberia-sur","planId":"pro"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$PAYMENT_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:3000/api/webhooks/payments \
  -H 'Content-Type: application/json' -H "x-payment-signature: $SIG" -d "$BODY"
```

```ts
import { createHmac } from 'node:crypto';
const signature = createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!).update(body).digest('hex');
```

Event body (all strings):

| Field               | Required | Meaning                                                                |
| ------------------- | -------- | ---------------------------------------------------------------------- |
| `id`                | yes      | unique event id (idempotency key); use a new one per event             |
| `type`              | yes      | `payment.succeeded`, `payment.failed`, `subscription.trial_started`, `subscription.canceled` |
| `tenantSlug`        | yes      | the business                                                           |
| `planId`            | for `payment.succeeded` / `subscription.trial_started` | `gratis`, `pro` or `negocio`   |
| `externalPaymentId` | no       | the id the gateway gave to the payment                                 |
| `currentPeriodEnd`  | no       | ISO date; without it the payment covers 30 days from now               |

Anyone with `PAYMENT_WEBHOOK_SECRET` can confirm a payment: never use the fake gateway with a real
charge, and keep the secret out of the repository.

## Layout

`src/billing`: `domain/` (plans, limits, state machine, errors), `application/` (ports and use cases:
status, checkout, cancel, resume, plan gate, apply event, webhook), `infrastructure/` (Mongo and in-memory
adapters, `FakePaymentGateway`, the controllers, the factory), `billing.module.ts` (the only place where ports are bound).
Contract suites: `SubscriptionReader + SubscriptionWriter` and `PaymentEventLog`, run against the in-memory and the MongoDB adapters.
