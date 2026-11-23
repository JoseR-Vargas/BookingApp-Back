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
  so a day sent without `starts` loses its list. `offeredStarts` in `src/availability/availability.calculator.ts` is the single
  source of this rule: availability, booking creation and booking updates all go through it.
  The hours
  are stored per weekday as `HH:mm` strings in the `business_settings` collection and edited
  from the admin panel (`PUT /api/admin/schedule`). `SCHEDULE` in
  `src/catalog/catalog.config.ts` is only the seed used when the collection is empty:
  Mon-Fri 09:00-20:00, Sat 09:00-18:00, Sun closed.
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
