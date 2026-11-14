# Booking slots (30-minute grid)

## Rule

- Start times are every 30 minutes (`09:00`, `09:30`, ...), inside the opening hours
  (`SCHEDULE` in `src/catalog/catalog.config.ts`): Mon-Fri 09-20, Sat 09-18, Sun closed.
- A booking occupies `ceil(totalDuration / 30)` consecutive 30-minute blocks from its start.
  The blocks are stored in `booking.slots`.
- There is no gap between bookings: a booking that ends exactly at `:00` or `:30` frees that
  same time for the next client.
- The last start must leave the whole window before closing.

| Start | Duration | Blocks occupied      | Next free start |
| ----- | -------- | -------------------- | --------------- |
| 09:00 | 20 min   | 09:00                | 09:30           |
| 09:00 | 50 min   | 09:00, 09:30         | 10:00           |
| 09:00 | 90 min   | 09:00, 09:30, 10:00  | 10:30           |

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
