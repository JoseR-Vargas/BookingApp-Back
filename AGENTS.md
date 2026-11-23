# BookingApp_Back — agent rules

NestJS + MongoDB (Atlas free). Architecture target: **light hexagonal** (`domain` / `application` / `infrastructure` per module), so the database can be swapped without touching use cases or business rules.

## Mandatory skills

Before writing or reviewing backend code under `src/`, load and follow, in this order:

1. `.agents/skills/hexagonal-architecture/SKILL.md`
2. `.agents/skills/solid-composition/SKILL.md`

They apply to every change: SRP, dependency inversion, composition over inheritance, the adapter pattern in infrastructure, and the inward-only import direction.

## Non-negotiables

- `domain/` and `application/` never import `mongoose`, `@nestjs/mongoose`, HTTP types or `process.env`.
- Repositories return domain models, never Mongoose documents.
- Domain errors are not `HttpException`; one infrastructure filter maps them.
- Business failures are `Result` values (`src/shared/domain/result.ts`): no `throw` in `domain/` or `application/use-cases/`. Infrastructure failures stay exceptions (500). Only `respond(result)` in `infrastructure/http` turns an `Err` into HTTP.
- Ports are bound to adapters only in the module file.
- A change that breaks a layer boundary is not done, even if tests pass.

## Specs

Work follows `specs/` in the sibling repository `BookingApp_Front` (spec-driven: spec first, then implementation).

## Status

`branding` is migrated (hexagonal layout, spec 09; `Result`, spec 10). Existing modules (`catalog`, `bookings`, `availability`, `admin`, `auth`, `email`, `whatsapp`) predate these rules and are migrated one module per spec. New code follows the rules from day one; do not extend the old pattern.
