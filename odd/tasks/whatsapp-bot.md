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
- [x] T2 — `AvailabilityService` + `GET /api/availability?date=&serviceId=`
      with duration-based slot blocking; no client data in the response.
- [x] T3 — Booking integrity: overlap validation in `create`, `slots` field +
      unique index, email optional, cancelled bookings never block,
      backfill script for existing bookings, fix `checkAvailability`.
      Includes review follow-ups R3-001 (reject/normalize booking times off
      the slot grid, e.g. 10:30) and R3-002 (guarantee numeric
      `service.duration`; backfill coerces strings).
- [x] T4 — `whatsapp` module: webhook (GET verify + POST with
      `X-Hub-Signature-256` validation), Cloud API HTTP client,
      `ConversationState` persisted in Mongo.
- [x] T5 — Bot flow: service -> day -> time -> professional -> confirm, using
      interactive list messages and reply buttons; ends in `BookingsService.create`.
- [x] T8 — Admin notification: when a booking is created (bot OR web), send
      the admin a WhatsApp utility-template message (`ADMIN_WHATSAPP_NUMBER`,
      `WHATSAPP_ADMIN_TEMPLATE_NAME`). Best-effort, awaited with a timeout
      (serverless freezes un-awaited work): a send failure or slowness never
      breaks the booking. No circular module dependency with the bot module.
- [x] T9 — Meta setup guide (`docs/whatsapp-setup.md`) + `.env.example`:
      step-by-step Meta configuration, env var table, webhook URL, exact
      template text/variables to submit, smoke-test commands.
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
  10/10. Commit: `e1cae47` on `feat/whatsApp-bot-01-catalog` (387 lines incl.
  this document).
- Note: `src/app.module.ts` already fails `prettier --check` (pre-existing).

- T1 review assessment (base `feat/whatsApp-bot`, committed-only, untracked
  `.atl/` excluded): risk medium, `review_due: false`, reason `under_budget`
  (387 lines). Reviewed boundary stays at `feat/whatsApp-bot`; pending in slice.

- T2 (delegated writer, trigger: 7 new files) on
  `feat/whatsApp-bot-02-availability`. Risk tier: medium. Pure calculator in
  `src/availability/availability.calculator.ts` (reused by T3/T5).
  RED: 3 suites TS2307, then 31/35 failing against a stub. GREEN:
  `npx jest src/availability` 49/49; build ok; eslint clean. Parent spot check:
  49/49. `npm test`: 130/130 tests, but suite `src/app.controller.spec.ts`
  fails to compile due to an uncommitted IDE quick-fix edit (fake `expect`,
  `node:test` import) not made by the feature work; excluded from the commit.
  ~680 authored lines (≈380 specs).
- Open item: past dates/hours are not filtered; needs business timezone
  decision (candidate for T5).

- T2 commit: `2a98942` on `feat/whatsApp-bot-02-availability`.
- Review (slices 01+02, base `feat/whatsApp-bot`, 1084 lines, medium,
  `slice_budget_reached`): consent granted; lens review-reliability; state
  approved; acknowledged, lineage `review-8efb4b8289cf1ba5`, authority burned.
  Reviewed boundary now `2a98942`. Non-blocking follow-ups: R3-001, R3-002
  (moved into T3); R3-003 (freeze/copy catalog config) and R3-004 (supertest
  e2e for GET /availability) deferred as suggestions.

- T3 (delegated writer, trigger: 10 non-trivial files) on
  `feat/whatsApp-bot-03-booking-integrity`. Risk tier: high (schema, unique
  index, migration script). Partial unique index
  `{professional.id, date, slots}` with filter
  `{status:'confirmed', slots:{$exists:true}}` (missing field indexes as null;
  verified in MongoDB docs via Context7). `create` uses catalog duration,
  validates start slot and overlap, maps 11000 to 'Ya existe una reserva';
  `update` re-validates; PATCH now maps business errors to 400; email optional;
  `checkAvailability` ignores cancelled + overlap. Backfill:
  `npm run build && npm run backfill:slots [-- --apply]` (dry-run default).
  RED: 39 failing + compile errors before implementation. GREEN:
  `npx jest src/bookings` 100/100; `npm test` 167/167; build ok; touched
  source files eslint-clean (pre-existing spec/gateway lint debt remains).
  Parent spot check: `npm test` 167/167. ~1190 authored lines (≈660 specs).
- Behavior change to note: the current frontend can no longer book a 90-min
  service at 12:00/19:00 (server now returns 400); T6 aligns the frontend.

- Scope update (user, this session): Google Calendar is OUT of scope. Goal is
  "code complete, only Meta credentials missing": T4, T5, T8, T9 are built so
  the app boots and tests pass with NO WhatsApp env vars; WhatsApp features
  activate only when the env vars are provided. Unconfigured behavior: outbound
  sends are skipped with a warn log; webhook POST fails closed (401) without
  `WHATSAPP_APP_SECRET`; webhook GET verify fails (403) without
  `WHATSAPP_VERIFY_TOKEN`.
- Env contract: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION`
  (default `v21.0`), `ADMIN_WHATSAPP_NUMBER`, `WHATSAPP_ADMIN_TEMPLATE_NAME`
  (default `nueva_reserva`), `WHATSAPP_ADMIN_TEMPLATE_LANG` (default `es`),
  `BUSINESS_TIMEZONE` (IANA; no default: needed to filter past hours, owner
  must provide it).
- T3 review (high-risk assessment on slice 03) is still due; it will be
  covered by the next review over base `2a98942` after T4 is committed
  (assessment needs `--untracked-scope=exclude` because `.atl/` is untracked).

- T4 (delegated writer, trigger: ~19 new files) on
  `feat/whatsApp-bot-04-whatsapp-module`. Risk tier: high (public unauthenticated
  webhook, HMAC signature, secrets handling). `src/whatsapp/`: `WhatsappApiModule`
  (config + `WhatsappClient`, imports no feature module, so T8/T5 cannot create
  a cycle) and `WhatsappModule` (webhook, `ProcessedMessage` TTL 48h,
  `ConversationState` TTL 24h, replaceable `WhatsappMessageHandler` token).
  `rawBody: true` set in `createApp()` (`api/index.js` already goes through it).
  Webhook processes messages before answering 200 (Vercel freezes the function
  after the response); per-message errors are logged, never 5xx.
  RED: 7 suites failed with TS2307 (no implementation) before coding. GREEN:
  `npx jest src/whatsapp` 88/88; `npm test` 255/255; `npm run build` ok;
  eslint clean on `src/whatsapp`. Authored lines: ~700 source + ~1075 specs
  (naturally above the 400 advisory; tests kept in the same commit). Commit:
  `59e5593` on `feat/whatsApp-bot-04-whatsapp-module`.
- Open item: raw-body signature check on Vercel needs a real smoke test with the
  Meta webhook (T9 guide), since Vercel's Node helpers may touch the request
  stream before Nest's body parser.

- T3+T4 review (base `2a98942`, 3235 lines, high): consent granted, but the
  OpenCode reviewer Task transport refused with
  `immutable_review_transport_unsupported` on gentle-ai 4.0.0 stable. Equivalent
  upstream issue #5117 is closed; maintainer says fixed in v4.1.1 (installed
  build predates it), so no report was filed. Candidate declined via the
  provider-issued decline (`declined_this_candidate`); no review record exists.
  Action for the owner: upgrade gentle-ai to >= v4.1.1, then re-run the review
  over base `2a98942`. Review of T3+T4 stays PENDING.

- T5 (delegated writer, trigger: ~7 new files + state machine) on
  `feat/whatsApp-bot-05-bot-flow`. Risk tier: medium (replaces the logging
  handler; creates real bookings from untrusted chat input, but through the
  already-hardened `BookingsService.create`). `src/whatsapp/bot/`: `BotHandler`
  (service -> day -> time -> professional -> confirm, reply ids
  `svc:|day:|time:|pro:|confirm:` validated per step; stale replies re-send the
  current prompt), pure `business-time.ts` (`BUSINESS_TIMEZONE` via
  `Intl.DateTimeFormat`, past-hour filter closes the T2 open item; unset or
  invalid timezone => error log + polite "try later" reply, never books blind),
  `bot.messages.ts` (all Spanish copy). `WhatsappModule` imports
  `BookingsModule`/`AvailabilityModule`/`CatalogModule` (no forwardRef);
  `BookingsModule` exports `BookingsService` and does NOT import
  `WhatsappModule`. `LoggingWhatsappMessageHandler` removed (unused).
  RED: `business-time`, `bot.handler` suites failed with TS2307 before
  implementation; the wiring spec failed (handler not `BotHandler`, no
  `BookingsService`) before the module change. GREEN: `npx jest src/whatsapp/bot`
  53/53; wiring spec 2/2 with no WHATSAPP_*/BUSINESS_TIMEZONE env; `npm test`
  310/310; build ok; eslint + prettier clean on touched files. Commit:
  `0c64ecc` (~1310 authored lines, ~720 specs; above the 400 advisory, tests
  kept in the same commit).

- T8 (delegated writer, trigger: cross-module change + notifier, parent-routed)
  on `feat/whatsApp-bot-06-admin-notify-docs`. Risk tier: medium (best-effort
  outbound message on the booking path; failures contained). `AdminBookingNotifier`
  lives in `WhatsappApiModule` (exported); `BookingsModule` imports only
  `WhatsappApiModule` (no forwardRef, no cycle). Pure
  `buildAdminTemplateParams` fixes the 6 body params: {{1}} client, {{2}}
  service, {{3}} professional, {{4}} dd/mm/yyyy, {{5}} HH:MM, {{6}} client phone.
  `BookingsService.create` awaits the notifier after save/websocket/email,
  bounded by a 5000 ms `Promise.race` (timer cleared), inside try/catch.
  RED observed: params and notifier suites TS2307; config spec TS2339 (new
  getters); module wiring 3 failing (notifier not exported/injected, imports);
  `bookings.service` 3 failing (notifier not called, timeout case). GREEN:
  `npx jest src/bookings src/whatsapp` 272/272; `npm test` 339/339; build ok;
  eslint + prettier clean on touched files (`bookings.service.spec.ts` keeps its
  pre-existing eslint debt, count unchanged at 114). ~160 source + ~360 spec lines.
  Commit: `dd9e71c`.

- T9 (delegated writer, passive documentation; no behavior change). Risk tier:
  low. `docs/whatsapp-setup.md` (English, matching the README; admin template
  text in Spanish) covers prerequisites, Meta app/token/secret, webhook order,
  the `nueva_reserva` template ({{1}} client, {{2}} service, {{3}} professional,
  {{4}} dd/mm/yyyy, {{5}} HH:MM, {{6}} phone), env var table incl. required
  `BUSINESS_TIMEZONE`, copy-paste smoke tests (GET verify, signed POST, bot,
  web booking, logs), the open raw-body 401 risk, test-number limits,
  24h window/costs, go-live checklist and a troubleshooting table.
  `.env.example` appended with all WhatsApp/admin/timezone variables (empty);
  one README line links the guide. Check (structural readback, no RED/GREEN
  applicable): 18 headings, all table rows with consistent columns, code fences
  balanced, grep confirms every env var name in the guide and `.env.example`
  exists in `src/` or the env contract above. ~380 authored lines (guide 339).
  Commit: `9abc415`.

## Next step
Owner actions: upgrade gentle-ai to >= v4.1.1 and re-run the review over base
`2a98942` (covers T3+T4 and everything after); get the phone line; follow
`docs/whatsapp-setup.md` (Meta app, token, webhook, `nueva_reserva` template);
set `BUSINESS_TIMEZONE` and the other env vars in Vercel, then run the smoke
tests. Remaining engineering work: T6 (frontend consumes `/catalog` and
`/availability`) and T7 (protect `GET /api/bookings`), both in the frontend
repo / after T6.
