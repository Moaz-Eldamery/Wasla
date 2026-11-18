# Sprint 1 test plan

This plan covers the Sprint 1 acceptance criteria in KAN-64. All test data is
synthetic and the database E2E suite uses an isolated database configuration.

## Equivalence partitions and boundaries

| Area | Valid partition | Invalid partitions and boundaries | Automated evidence |
|---|---|---|---|
| Patient phone | E.164 Egyptian phone accepted | Missing, malformed, duplicate, and unverified phone rejected | Auth unit/E2E tests |
| OTP | Six-digit code for the active registration | Wrong code, expired code, consumed code, and more than five failed guesses rejected | Auth OTP tests |
| Result file | PDF, JPEG, or PNG at or below 10 MB | Empty, mismatched type, unsupported type, and more than 10 MB rejected | `clinical.e2e-spec.ts` |
| Booking | An available slot can be booked once | Already-booked slot returns `SLOT_TAKEN`; retry is idempotent for the winner | `booking.e2e-spec.ts` |

## State-transition coverage

The visit workflow is tested as:

```text
BOOKED -> CHECKED_IN -> IN_CONSULTATION -> COMPLETED
BOOKED -> CANCELLED
CHECKED_IN -> NO_SHOW
```

Journey tests additionally cover the data-driven stages `BOOKED`,
`CHECKED_IN`, `WITH_DOCTOR`, `TEST_ORDERED`, `RESULT_READY`, and `DONE`.
Invalid transitions are rejected by the core service.

## Concurrency and access-control tests

- Simultaneous booking requests for one slot produce exactly one `201` and
  all other responses are `409 SLOT_TAKEN`.
- Simultaneous check-in and call-next requests are serialized so only one
  valid state change wins.
- Simultaneous test start, upload, and release requests cannot bypass workflow
  state.
- Patients can only read their own appointments, journeys, results, and
  summaries.
- Doctors can access only their assigned patients; receptionists and admins
  cannot read clinical notes or lab results.
- Refused access and important successful actions are written to the
  append-only audit log.

## CI execution

GitHub Actions runs lint, unit tests, builds, local Core-to-AI integration,
stack smoke tests, and database-backed Auth/Core E2E tests. The database job
uses synthetic seed data and a private MinIO bucket; no production data or
credentials are used.
