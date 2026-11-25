# Public availability page

`/disponibilidad` (front) is a public link that shows, in real time, which turns are free. It is
off until the admin turns it on in Configuración → Compartir.

## Settings

Stored in `business_settings` (same document as the schedule), field `publicAvailability`:

| Field        | Meaning                                                | Default |
| ------------ | ------------------------------------------------------ | ------- |
| `enabled`    | The page and `GET /api/public-availability` serve data | `false` |
| `days`       | Days shown, today included (1 to 14)                   | `7`     |
| `serviceIds` | Published services, or `null` for every active service | `null`  |

`PUT /api/admin/public-availability` (admin key) saves the three fields; `GET /api/admin/catalog`
returns them as `publicAvailability`. A document stored without the field reads as the defaults.

## `GET /api/public-availability?serviceId=<id>[&locationId=<id>]`

Public, no key. Disabled: `{ "enabled": false }`. Enabled: the published services, the chosen
service (the first one when `serviceId` is omitted) and, per day, each start time with the
professionals free at it. A service that is not published (or is inactive or unknown) is a 404.

- `locationId` picks the location (default: the default location, see
  [locations.md](./locations.md)); an unknown or inactive one is a `404`
  `Location "<id>" not found`. The response adds `locations: [{ id, name }]` (the active ones, for a
  selector) and `locationId` (the one the days were computed for). The settings above (`enabled`,
  `days`, `serviceIds`) stay global; the hours and professionals are those of the chosen location.
  When the page is disabled the answer is still just `{ "enabled": false }`.
- The hours come from `GetAvailabilityUseCase` (the WhatsApp bot reaches it through the temporary
  `AvailabilityService.getAvailability` facade), the same source as the booking modal, so start interval, per-day starts and existing bookings are respected.
- "Today" is the business date (`BUSINESS_TIMEZONE`, UTC date when unset), read through the
  `BusinessClock` port (`SystemBusinessClock`); the use case never reads the environment. With
  `BUSINESS_TIMEZONE` set, today's hours that already passed are dropped; without it nothing is
  hidden, because a wrong timezone would hide real turns.
- It exposes no prices, clients or booking counts.
- Each request runs one availability lookup per day (at most 14).
