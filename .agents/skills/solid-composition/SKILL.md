---
name: solid-composition
description: "Trigger: SOLID, single responsibility, dependency inversion, composition over inheritance, adapter pattern, class design, refactor, code review in the backend. Keep classes small and swappable."
license: Apache-2.0
metadata:
  author: "JoseR-Vargas"
  version: "1.0"
---

## Activation Contract

Load when writing, reviewing or refactoring any class or function in BookingApp_Back, together with `hexagonal-architecture`.

## Hard Rules

1. **SRP:** one reason to change per class. A use case does one action. Split a class that has more than one responsibility, more than 250 lines or more than 5 constructor dependencies.
2. **OCP:** add behavior by adding an adapter or strategy. Never branch on "which database" or "which provider" inside a use case.
3. **LSP:** an adapter honors the whole port contract: same results, same absence handling, same domain errors. Proof: the shared contract test.
4. **ISP:** ports are small and per consumer (`BookingReader`, `BookingWriter`). No catch-all repositories.
5. **DIP:** depend on ports, never on concrete adapters, SDKs, `process.env`, `new Date()` or `Math.random`. Inject clock, id generator and config as ports.
6. **Composition over inheritance:** no `extends` except `Error`/`DomainError` and what a framework forces. No abstract base classes. Share behavior through collaborators or pure functions.
7. **Errors as values:** a business failure is `return err(...)` of a `Result`; no `throw` in domain or use cases. Infra failures stay exceptions. New modules join `RESULT_MODULES`; never extend the throwing style.
8. **Adapter pattern:** every external system (Mongo, email, WhatsApp, socket, clock) sits behind a port. The adapter wraps the SDK by composition and implements the port.

## Decision Gates

| Smell | Fix |
| --- | --- |
| `if (db === ...)` in a use case | New adapter, same port |
| Use case imports `mongoose` or `process` | Introduce a port, inject it |
| Repository returns a document | Map to a domain model in the adapter |
| Base class shared by two services | Extract a collaborator or function |
| Port with methods a consumer ignores | Split the port |
| `throw new XError` in a rule or use case | `return err(new XError(...))`; the edge calls `respond(result)` |
| Class test needs many mocks | Class has too many responsibilities |

## Execution Steps

1. List the responsibilities of the class in one line each.
2. If more than one, extract each behind a port or into its own class.
3. Replace concrete dependencies with ports injected in the constructor.
4. Remove inheritance in favor of composition.
5. Check the rules above against the diff before finishing.

## Output Contract

Return violations as `file:line — rule — fix`, then the applied fixes. Report none only after checking each rule.

## References

- `.agents/skills/hexagonal-architecture/SKILL.md` — layers and where code lives.
