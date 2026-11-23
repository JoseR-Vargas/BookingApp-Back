# Layout of a module (light hexagonal)

```
src/<module>/
  domain/
    booking.ts                  # domain model (plain TS)
    booking.rules.ts            # pure business rules
    booking.errors.ts           # BookingNotFoundError extends DomainError
  application/
    ports/
      booking.repository.ts     # interface + BOOKING_REPOSITORY token
      clock.port.ts             # CLOCK token
    use-cases/
      create-booking.use-case.ts
  infrastructure/
    persistence/mongo/
      booking.entity.ts         # Mongoose schema (never exported outside)
      booking.mapper.ts         # entity <-> domain
      mongo-booking.repository.ts   # implements the port by composition
    persistence/in-memory/
      in-memory-booking.repository.ts   # used by use-case tests
    http/
      bookings.controller.ts
      create-booking.dto.ts     # input validation
  <module>.module.ts            # composition root: { provide: BOOKING_REPOSITORY, useClass: MongoBookingRepository }
src/shared/                     # kernel: DomainError, shared tokens
```

Contract test: `booking.repository.contract.ts` exports `describeBookingRepositoryContract(factory)`;
each adapter's spec calls it with its own factory. A new database passes the same suite or it is not done.

Allowed import examples:

- `application/use-cases/*` → `../ports/*`, `../../domain/*`
- `infrastructure/persistence/mongo/*` → `application/ports/*`, `domain/*`, `mongoose`
- `domain/*` → other `domain/*` and `shared/*` only
