# Booking cancellation

A client cancels from a link, with no account. Each booking has a secret token; whoever holds the
link can cancel that one booking, until one minute before it starts.

## Flow

1. `POST /api/bookings` creates the booking and returns the token once, as `cancelToken`.
   Only its SHA-256 hash is stored (`cancelTokenHash`, hidden from every query).
2. The confirmation email and the booking confirmation screen show
   `<frontend>/cancelar/<token>`.
3. That page calls the two public endpoints below.

| Endpoint | Answers |
| -------- | ------- |
| `GET /api/bookings/cancel/:token` | `200 { state, services:[{name}], professional:{name}, date, time }` with `state` = `cancellable`, `closed` or `cancelled`; `404` unknown or malformed token; `503` no valid `BUSINESS_TIMEZONE` |
| `POST /api/bookings/cancel/:token` | `200` cancelled (also when it already was); `409` too late; `404`; `503` |

The summary never includes the client's name, phone or email.

## Time rule

The client may cancel while `now <= start - 60 s`, where `start` is the booking's `date` + `time`
read in `BUSINESS_TIMEZONE` (`src/bookings/cancellation.ts`, `cancelWindow`). From 59 s before the
start, at the start and after it, the answer is `409`. The clock is the server's.

`BUSINESS_TIMEZONE` is required: `date` and `time` carry no zone. If it is unset or invalid the
endpoints answer `503` instead of guessing, except for a booking that is already cancelled.

The admin is not bound by this rule: it cancels from the panel with `PATCH /api/bookings/:id`
`{ "status": "cancelled" }` at any time.

## What happens on a cancellation

Only when the booking really changes (not on an idempotent repeat or a lost race):

- The slot is freed: the unique slot index ignores cancelled bookings.
- Socket event `bookingCancelled` with `{ id, status: "cancelled" }`, so an open admin panel updates.
- An email to the client, if the booking has one.
- A WhatsApp template to the admin, if `WHATSAPP_ADMIN_CANCEL_TEMPLATE_NAME` is set
  (see `docs/whatsapp-setup.md`, section 4.1).

Email, socket and WhatsApp are best effort: a failure is logged and never fails the cancellation.

## Access control

`GET /api/bookings`, `/statistics`, `/:id`, `PATCH` and `DELETE` require
`Authorization: Bearer <ADMIN_API_KEY>`. Public: `POST /api/bookings`, `POST /api/bookings/availability`
and the two cancel routes.

## Configuration

| Variable | Needed for | If missing |
| -------- | ---------- | ---------- |
| `BUSINESS_TIMEZONE` | Judging the one-minute cutoff | Cancel endpoints answer `503` |
| `PUBLIC_APP_URL` | The link in the confirmation email | The email is sent without the cancel block |
| `WHATSAPP_ADMIN_CANCEL_TEMPLATE_NAME` | The admin WhatsApp notice | Notice skipped with a warning |
| `ADMIN_API_KEY` | The admin routes above | They answer `401` |

## Existing bookings

Bookings created before this feature have no token, so they cannot be cancelled from a link. The
admin can cancel them from the panel.
