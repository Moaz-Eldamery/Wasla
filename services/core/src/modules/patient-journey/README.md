# Patient journey module (IJourney)

Works out the patient's current stage, next step and where to go, from the visit state and stage rows in `core.journey_stages`.

**Rule:** Other modules use this one only through its public service (`JourneyService`). Stages and messages are stored as data in `core.journey_stages`, never hard-coded in the service.

## Files

- `journey.module.ts`: the module. Exports `JourneyService` (IJourney).
- `journey.controller.ts`: `GET /appointments/{appointmentId}/journey`.
- `journey.service.ts`: resolves the patient's current stage (`BOOKED`, `CHECKED_IN`, `WITH_DOCTOR`, `TEST_ORDERED`, `RESULT_READY`, `DONE`) and location (`APPOINTMENT_CLINIC`, `TEST_CLINIC`, `NONE`) from `core.journey_stages`, with record-ownership checks and audit logging for denied access. Test: `journey.service.spec.ts`.
- `journey.views.ts`: the `Journey` response shape from the contract and the Prisma selects that load it.

Still to come: live journey updates via events (KAN-27).

