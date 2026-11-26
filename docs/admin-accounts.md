# Admin accounts (spec 20)

Each business has its own admin accounts with a password and a role. The panel
signs in with a session cookie; the shared `ADMIN_API_KEY` keeps working during
the transition.

## Model

- `admin_users`: `tenantId`, `email` (lowercase, unique per business), `name`,
  `passwordHash`, `role` (`owner` | `staff` | `viewer`), `active`, `createdAt`,
  `lastLoginAt`. Indexes: `{tenantId, email}` unique, `{tenantId, role}`.
- `admin_sessions`: `tenantId`, `userId`, `tokenHash`, `expiresAt`, `createdAt`,
  `userAgent`. Indexes: `{tenantId, tokenHash}` unique, `{tenantId, userId}` and
  a TTL on `expiresAt` (MongoDB removes expired sessions, no cron). The TTL index
  cannot be compound, so it is the one index without `tenantId`.
- Both collections are tenant-scoped (`tenantScopePlugin`, `SCOPED_COLLECTIONS`,
  `INDEX_PLANS`). The same email in two businesses is two accounts.

## Security

- Passwords: Node's `crypto.scrypt` (N=16384, r=8, p=1, 16-byte salt), stored as
  `scrypt$N$r$p$salt$hash`, compared with `timingSafeEqual`. 10 to 128 characters.
- Session token: 32 random bytes (base64url). Only its SHA-256 is stored. It lives
  in the cookie `admin_session` (`HttpOnly; SameSite=Lax; Path=/`, plus `Secure` when
  `NODE_ENV=production`), 7 days.
- A token only works in the business that issued it: the lookup runs inside the
  request's tenant scope (`X-Tenant`), so business B never finds the session of A.
- Login failures (unknown email, wrong password, inactive account, malformed input)
  answer the same `401 Correo o contraseña incorrectos` and do the same work (a
  dummy scrypt runs when there is no account).
- No response carries `passwordHash` or the token (only the cookie of the login).
- Deactivating an account or rotating its password revokes its sessions.
- The last active owner cannot be demoted or deactivated (`409`).

## Roles

| Action | owner | staff | viewer |
| --- | --- | --- | --- |
| Read bookings, statistics, admin catalog | yes | yes | yes |
| Update / delete bookings (`PATCH`, `DELETE /bookings/:id`) | yes | yes | no |
| Professionals, services, locations, schedules, branding, public availability | yes | no | no |
| User administration | yes | no | no |

`@Roles(...)` (`src/auth/infrastructure/http/roles.decorator.ts`) sets the roles of
a route or controller. A guarded route without it is readable by every role and
owner-only for any mutating method, so a new route is closed by default. A forbidden
role answers `403 No tienes permiso para realizar esta acción.`; no credential
answers `401`. The legacy key counts as owner.

## HTTP

| Route | Who | Notes |
| --- | --- | --- |
| `POST /api/admin/session` | public | `{email, password}` -> `200 {ok, user}` + cookie |
| `GET /api/admin/session` | any credential | key: `{ok: true}`; session: `{ok: true, user, trial}` (`trial` is `null` without a free trial, spec 21) |
| `DELETE /api/admin/session` | public | revokes the cookie's session, clears it, `{ok: true}` |
| `GET /api/admin/users` | owner | list |
| `POST /api/admin/users` | owner | `{email, name, password, role}` -> 201 |
| `PATCH /api/admin/users/:id/role` | owner | `{role}` |
| `POST /api/admin/users/:id/deactivate` | owner | revokes its sessions |
| `PUT /api/admin/users/:id/password` | owner | `{password}`, revokes its sessions |

## Legacy key

`AdminKeyGuard` still accepts `Authorization: Bearer <ADMIN_API_KEY>` (and
`X-Admin-Username`), exactly as before. To turn it off for a business once it has
its owner, list its slug in `ADMIN_KEY_DISABLED_TENANTS` (comma separated). The
WebSocket handshake still uses the key (`BookingsGateway`).

## Bootstrap

```bash
npm run admin:create -- --tenant barberia-sur --email ana@example.com --name "Ana" --password "a-long-password"
```

Creates the first owner of the business (`--tenant` is the slug). The owner creates
the rest from the panel.

## Layers

`src/auth` follows the light hexagonal layout (`MIGRATED_MODULES` and
`RESULT_MODULES` include `auth`): `domain/` (rules, errors), `application/` (ports
`AdminUserReader/Writer`, `AdminSessionReader/Writer`, `PasswordHasher`,
`SessionTokens`, one use case per action) and `infrastructure/` (Mongo and
in-memory repositories, scrypt hasher, token generator, controllers, guard).
Contract suites: `admin-user-repository.contract.ts` and
`admin-session-repository.contract.ts`. The auth errors have kind `forbidden`
(the shared kinds have no "unauthorized"); `respondAuth` answers them as 401.
