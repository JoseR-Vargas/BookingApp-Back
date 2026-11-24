---
name: hexagonal-architecture
description: "Trigger: backend code, use case, port, repository, adapter, mapper, DTO, controller, schema, database swap, new module. Enforce light hexagonal layers domain/application/infrastructure in BookingApp_Back."
license: Apache-2.0
metadata:
  author: "JoseR-Vargas"
  version: "1.0"
---

## Activation Contract

Load before creating, moving, reviewing or refactoring code under `src/` of BookingApp_Back, and before any change that touches persistence, HTTP input or an external service.

## Hard Rules

1. Each module has `domain/`, `application/`, `infrastructure/`. Imports go inward only: `infrastructure → application → domain`. Never the reverse.
2. `domain/`: business rules, domain models, domain errors. Pure TypeScript: no `@nestjs/*`, `mongoose`, HTTP, `process.env`, `new Date()` or I/O.
3. `application/`: ports (interfaces plus injection tokens) and use cases (one class, one `execute`). Imports `domain/` only. From Nest, only `@Injectable` and `@Inject` are allowed here.
4. `infrastructure/`: DB connection, persistence entities (schemas), mappers, repository adapters, controllers, input DTOs, email/socket/WhatsApp adapters, exception filters.
5. Repositories take and return domain models. Entities, documents and Mongoose types never leave `infrastructure/`; a mapper converts both ways.
6. Domain errors extend a plain `DomainError`, never `HttpException`. One filter in `infrastructure/` maps them to HTTP.
7. Ports are bound to adapters only in `<module>.module.ts`, through tokens.
8. Business failures are `Result` values (`src/shared/domain/result.ts`): rules and use cases return `Result<T, DomainError>` and never `throw`. Infrastructure failures (database down) stay exceptions and end in a 500. Only `infrastructure/http` turns an `Err` into HTTP, through `respond(result)` and the single filter.
9. Swapping the database = a new adapter folder plus one binding. Use cases and domain stay untouched. Every port has a contract test that runs against every adapter, in-memory one included.

## Decision Gates

| Code is... | Goes in |
| --- | --- |
| A business rule or invariant | `domain/` |
| A pure calculation (slots, schedules) | `domain/` |
| "Do X when the user asks" | `application/use-cases/` |
| An interface to something outside | `application/ports/` |
| Mongo schema, query, mapper | `infrastructure/persistence/<db>/` |
| Controller, DTO, validation of input | `infrastructure/http/` |
| A business failure (invalid, not found) | `return err(new XError(...))`, never `throw` |
| Nest module wiring | `<module>.module.ts` |

## Execution Steps

1. Put the rule in `domain/`; name its failure as a domain error.
2. Define the port the use case needs, as small as possible.
3. Write the use case against the port only.
4. Write the adapter, entity and mapper in `infrastructure/`.
5. Bind port to adapter in the module.
6. Test: domain (pure, assert the `Err`), use case (in-memory adapter), adapter (contract), HTTP.
7. Run `npm test`; `src/architecture.spec.ts` must pass (it rejects `throw` in `domain/` and `application/use-cases/` of modules in `RESULT_MODULES`).

## Output Contract

Return the files created or moved per layer, the ports added, and any import that crosses a layer the wrong way (fix it, do not report-and-leave).

## References

- `references/layout.md` — folder layout and a worked example.
