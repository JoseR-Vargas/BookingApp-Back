# WhatsApp booking bot

## Objective
Let clients book appointments through WhatsApp: the bot asks for service and
day, shows real availability per professional from the database, and creates
the booking.

## Problem
- The backend has no catalog: professionals, services and business hours are
  hardcoded in the frontend (`BookingApp_Front/src/config/appConfig.js`,
  `BookingApp_Front/src/utils/schedule.js`). A bot cannot ask the backend
  "what is free on Tuesday?".
- Availability is computed in the browser by downloading every booking via the
  public `GET /api/bookings`, which leaks client PII (name, email, phone).
- Service duration is ignored: a 90-min booking at 10:00 leaves 11:00 free.
- `checkAvailability` does not ignore cancelled bookings (`create` does).
- No unique index: concurrent requests can double-book a slot.
- `client.email` is required, but WhatsApp only provides a phone number.

## Decisions (user-approved)
- Channel: Meta WhatsApp Cloud API directly (no BSP, no Baileys/whatsapp-web.js:
  ToS ban risk and Vercel serverless cannot hold persistent sockets). Plain HTTP
  calls, no SDK.
- Catalog lives in a backend TypeScript config module (no Mongo collections
  yet; no admin UI exists). Migrate to DB later without touching the bot.
- Services longer than 60 min block `ceil(duration / 60)` consecutive hourly
  slots. A service is offered at a slot only if every required slot is free and
  the block does not cross lunch break or closing time.
- Overlap protection: each booking stores `slots: string[]` with a unique index
  on professional + date + slots (exact index shape to be verified in T3).
- Business hours (ported from front): Mon-Fri 09-20, Sat 09-18, Sun closed,
  lunch 13-14, 60-min slots.

## Scope / tasks
- [x] T1 — `catalog` module: professionals, services and weekly schedule ported
      from the frontend config; `GET /api/catalog`. Route: delegated writer
      (4+ new non-trivial files).
- [ ] T2 — `AvailabilityService` + `GET /api/availability?date=&serviceId=`
      with duration-based slot blocking; no client data in the response.
- [ ] T3 — Booking integrity: overlap validation in `create`, `slots` field +
      unique index, email optional, cancelled bookings never block,
      backfill script for existing bookings, fix `checkAvailability`.
- [ ] T4 — `whatsapp` module: webhook (GET verify + POST with
      `X-Hub-Signature-256` validation), Cloud API HTTP client,
      `ConversationState` persisted in Mongo.
- [ ] T5 — Bot flow: service -> day -> time -> professional -> confirm, using
      interactive list messages and reply buttons; ends in `BookingsService.create`.
- [ ] T6 — Frontend: consume `/catalog` and `/availability` instead of
      hardcoded config and full bookings download (BookingApp_Front repo).
- [ ] T7 — Protect `GET /api/bookings` (admin only). Must land after or with T6,
      otherwise the current frontend breaks.

## Out of scope / manual steps for the user
- Meta Business verification, WhatsApp phone number, access token, app secret,
  webhook verify token; set them as Vercel env vars.
- Approved utility templates for reminders outside the 24h window (paid).

## TDD mode
Jest (`npm test`, `testRegex: .*\.spec\.ts$`). Behavior tasks (T1-T5) follow
RED -> GREEN -> REFACTOR with focused specs.

## Delivery
- Branch: `feat/whatsApp-bot` (created by the user).
- Forecast: well above 400 authored changed lines across T1-T7.
  Strategy: `ask-on-risk`; chain strategy (user-chosen): `feature-branch-chain`.
- Tracker branch: `feat/whatsApp-bot` (draft/no-merge PR to `master`, opened
  by the user when pushing). Each slice branches from the previous slice:
  - Slice 01 `feat/whatsApp-bot-01-catalog` <- T1 (base: `feat/whatsApp-bot`)
  - Later slices `feat/whatsApp-bot-0N-<name>`, base = previous slice.

## Progress / evidence
- T1 (delegated writer, trigger: 6 new files). Risk tier: medium (new
  read-only endpoint). RED: both catalog specs failed with TS2307 before
  implementation. GREEN: `npx jest src/catalog` 10/10; `npm test` 85/85;
  `npm run build` ok; eslint clean. Parent spot check: `npx jest src/catalog`
  10/10. ~307 authored lines. Commit: pending chain-strategy decision.
- Note: `src/app.module.ts` already fails `prettier --check` (pre-existing).

## Next step
Confirm chain strategy, commit T1, then T2.
