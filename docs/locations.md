# Locations (multi-location, stage 1)

A business with several premises (locales) manages them from one panel. Each location has its own
address and its own weekly schedule; professionals can work at one or several locations; a booking
records the location it was made for. Full contract: `specs/08-multi-location.md` in the front
repository.

## Model

`locations` collection (`src/catalog/schemas/location.schema.ts`):

| Field                  | Meaning                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `id`                   | Slug of the name, unique and immutable (`centro`, `centro-2`...)     |
| `name`, `address`      | Up to 80 and 200 characters; the address may be empty                |
| `active`               | Inactive locations are hidden from the public side                   |
| `weekly`               | The week, same shape as before (`closed`, `open`, `close`, `starts`) |
| `slotIntervalMinutes`  | Fixed at 30                                                          |
| `startIntervalMinutes` | Start-time step, a multiple of 30 between 30 and 480                 |
| `createdAt`            | Decides which location is the default                                |

- Professionals keep an optional `locationIds: string[]`. A document without the field reads as
  `[<default location id>]`; existing documents are never rewritten.
- Bookings keep an optional `location: { id, name }` (the name as it was when booked). A booking
  without it reads as the default location.
- `business_settings` is unchanged and still holds `publicAvailability`. Its `weekly` and
  `startIntervalMinutes` are only the legacy source copied into the first location.

## Migration

`CatalogService.onModuleInit` calls `ensurePrincipalLocation` (`src/catalog/locations.ts`) after
seeding the settings. If `locations` is empty it inserts the location `principal` (name
"Principal", empty address) with a **copy** of the schedule stored in `business_settings`
(or the `SCHEDULE` seed when none is stored). It is idempotent (an atomic insert on the id, and
nothing happens when any location already exists) and never deletes or edits `business_settings`.
Between a deploy and the first start, reads fall back to a virtual "principal" built from the same
legacy schedule, so nothing fails.

## Default location

The **oldest active** location (`createdAt`). It is used when a request does not name a location
(`GET /api/availability`, `POST /api/bookings/availability`, `GET /api/public-availability`, the
WhatsApp bot), for professionals and bookings without the new field, and by the legacy
`PUT /api/admin/schedule`. Deactivating the oldest one moves the default to the next oldest.

## Rotation rule

A professional assigned to a location is offered during that location's **whole** schedule; there
is no per-day calendar between locations (stage 2). Occupancy stays per professional: the unique
index `uniq_confirmed_professional_date_slot` is on `(professional.id, date, slots)`, not on the
location, so a professional booked at one location is blocked at the same time at every other one
(both in availability and, as a last line of defence, by the index when two requests race).
Deactivating a location does not remove it from a professional's `locationIds`; the public
catalog only lists active ids.

## Endpoints

Public:

- `GET /api/catalog`: adds `locations: [{ id, name, address, schedule }]` (active only) and
  `locations: string[]` (active ids) on each professional. The top-level `schedule` is the default
  location's.
- `GET /api/availability`, `POST /api/bookings`, `POST /api/bookings/availability`,
  `GET /api/public-availability`: see [booking-slots.md](./booking-slots.md) and
  [public-availability.md](./public-availability.md).

Admin (`ADMIN_API_KEY`):

- `GET /api/admin/catalog`: adds every location with `active`, and `locations` on each
  professional (stored ids, inactive ones included).
- `POST /api/admin/locations` `{ name, address? }` → `201` with the location
  (`{ id, name, address, active, schedule }`, initial schedule = the seed, every 30 minutes).
- `PUT /api/admin/locations/:id` `{ name?, address?, active? }`. The last active location cannot be
  deactivated: `400` `Debe quedar al menos un local activo.` (the check is not transactional).
- `PUT /api/admin/locations/:id/schedule` `{ weekly, startIntervalMinutes? }` →
  `{ schedule, affectedBookings }`, with the same validations as `PUT /api/admin/schedule`.
  `affectedBookings` counts only the upcoming bookings of that location that fall outside the new
  hours (bookings without location count for the default one).
- `PUT /api/admin/schedule` keeps its contract and acts on the default location.
- `POST`/`PATCH /api/admin/professionals` accept `locations: string[]` (existing, active, distinct,
  at least one; default `[<default location>]`); otherwise `400`
  `El profesional debe trabajar en al menos un local activo.`

Validation messages: `El nombre del local es obligatorio (máximo 80 caracteres).`,
`La dirección del local no puede superar los 200 caracteres.`, `Location "<id>" not found` (404).

## Stage-2 limitations

- The WhatsApp bot is untouched. It asks `getAvailability` without `locationId`, so it only
  offers the hours of the **default location**, and it creates bookings without `location`. While
  a single location is active that books at the default location, as before. **With several
  active locations `POST /api/bookings` rejects a booking without `location`**
  (`Error de validación: debes elegir un local`), so the bot's booking step fails (the user gets
  its generic failure message) until the bot sends `location: { id }` (stage 2). Its professional
  list is also not filtered by location.
- No address in the confirmation email, no reports or filters by location, no services or prices
  per location, no per-day professional calendar across locations, and bookings cannot be moved to
  another location (`PATCH` ignores `location`).
