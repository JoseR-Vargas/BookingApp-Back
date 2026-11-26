# Booking slots (30-minute grid, configurable start interval)

## Rule

- Occupancy is always on a 30-minute grid. Start times offered to the public are every
  `startIntervalMinutes` counted from the opening time (default 30: `09:00`, `09:30`, ...),
  inside the opening hours. `startIntervalMinutes` is a multiple of 30 between 30 and 480,
  stored in `business_settings` next to the hours (`PUT /api/admin/schedule` accepts it as an
  optional field; when omitted the stored value is kept). A document stored without the field
  reads as 30. A day can also carry its own `starts` list (`HH:mm`, on the 30-minute grid, inside
  `[open, close)`, stored sorted): that day offers exactly those starts and ignores the interval;
  a day without `starts` follows the interval. `PUT /api/admin/schedule` replaces the whole week,
  so a day sent without `starts` loses its list. `offeredStarts` in `src/shared/domain/schedule/schedule.rules.ts` (re-exported by `src/availability/availability.calculator.ts`) is the single
  source of this rule: availability, booking creation and booking updates all go through it. The
  occupancy rules (`occupiedSlots`, `freeStartTimes`, `windowSlots`) live in
  `src/availability/domain/occupancy.rules.ts`, re-exported by the same calculator file for the
  modules that are not migrated yet; the availability of a day is `GetAvailabilityUseCase`
  (`src/availability/application/use-cases/`).
  The hours
  are stored per weekday as `HH:mm` strings **in each location** (`locations` collection, see
  [locations.md](./locations.md)) and edited from the admin panel
  (`PUT /api/admin/locations/:id/schedule`; `PUT /api/admin/schedule` edits the default location).
  `business_settings` only keeps the legacy copy that seeded the "principal" location.
  `SCHEDULE` in `src/catalog/catalog.config.ts` is the seed used for a new location and for a
  database without stored hours: Mon-Fri 09:00-20:00, Sat 09:00-18:00, Sun closed.
  Everything above (interval, per-day `starts`) applies **per location**: each location offers its
  own start times.
- A booking occupies `ceil(totalDuration / 30)` consecutive 30-minute blocks from its start.
  The blocks are stored in `booking.slots`.
- There is no gap between bookings: a booking that ends exactly at `:00` or `:30` frees that
  same time for the next client.
- The last start must leave the whole window before closing.

| Start | Duration | Blocks occupied     | Next free start |
| ----- | -------- | ------------------- | --------------- |
| 09:00 | 20 min   | 09:00               | 09:30           |
| 09:00 | 50 min   | 09:00, 09:30        | 10:00           |
| 09:00 | 90 min   | 09:00, 09:30, 10:00 | 10:30           |

Example with opening 09:00, closing 20:00 and `startIntervalMinutes: 180`: a 30-minute service
is offered at `09:00`, `12:00`, `15:00`, `18:00`; a 3-hour service at `09:00`, `12:00`, `15:00`
(the last start must still leave the whole window before closing). Booking at `10:00` is
rejected with the usual "horario no disponible" error. Bookings made before the interval
changed stay valid even if they fall off the new starts; they are not counted as out of hours.

`GET /api/availability` returns, per professional, only the free start times. Double booking is
prevented by the partial unique index on `{ professional.id, date, slots }` (confirmed bookings).
The index is per **professional**, not per location: a professional who rotates between
locations cannot be booked at two of them at the same time, and an availability lookup for one
location hides the hours the professional already has booked at another.

## Locations in availability and bookings

- `GET /api/availability?date&serviceIds[&locationId]`: without `locationId` the default
  location is used. An unknown or inactive id is a `404` `Location "<id>" not found`. Only the
  professionals assigned to the location are returned, with that location's schedule. The
  response adds `location: { id, name }`.
- `POST /api/bookings` accepts `location: { id }` (the name is taken from the catalog, never from
  the client). Without it the default location is used while a single location is active; with
  several: `400` `Error de validación: debes elegir un local`. Other errors:
  `Error de validación: <profesional> no trabaja en <local>`, `Error de validación: el local
  seleccionado no existe` (unknown or inactive), and the usual "el horario ... no está
  disponible" when the time is not offered by THAT location's schedule. The booking stores
  `location: { id, name }`.
- `POST /api/bookings/availability` accepts an optional `locationId` (default: the default
  location). An unknown or inactive location, or a professional who does not work there, answers
  `{ "available": false }`.
- `PATCH /api/bookings/:id` validates a change of date, time, services or professional against the
  location stored in the booking and cannot change it (a `location` in the body is ignored). A
  booking without `location` is validated against the default location and is not rewritten.
  Rescheduling a booking whose location was deactivated is refused with `el local seleccionado no
  existe`; changing only its status still works.

## Deploy: migrate existing bookings

Bookings created before the 30-minute grid store hourly blocks (a 90-minute booking holds 2
blocks instead of 3). Recompute them when deploying, otherwise some times stay free by mistake:

```bash
MONGODB_URI=... node scripts/migrate-slots-30min.js            # dry run (default)
MONGODB_URI=... node scripts/migrate-slots-30min.js --apply    # writes
```

Only confirmed bookings from today on are changed. Re-running is safe.

Its tests are not picked up by the default Jest config:

```bash
npx jest --rootDir . --testRegex 'scripts/.*\.spec\.js$' --transform '{}'
```
