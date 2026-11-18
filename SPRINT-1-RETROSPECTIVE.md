# Sprint 1 retrospective

## What went well

- The OpenAPI contract, generated frontend types, and Prism mock let the
  patient app and dashboard progress independently.
- Core ownership checks, transactional audit logging, and database-backed
  concurrency tests made the security-sensitive workflows explicit.
- Docker Compose and GitHub Actions provide repeatable local and CI checks.
- The deterministic synthetic seed gives every demo role and screen usable
  data without real patient information.

## What could be improved

- Database E2E setup is heavier than the unit suite and should be made easier
  to run locally without touching a developer's existing database.
- The frontend and backend acceptance evidence should be linked from Jira as
  each story is completed rather than collected at the end.
- Browser smoke checks should be run as a repeatable script instead of being
  performed manually.

## Sprint 2 plan

Prioritize the already-planned follow-up work: password recovery and profile
editing, schedule changes and cancellation/rescheduling, live updates,
notifications, formal accessibility/Arabic audits, and chatbot safety
boundaries. These are not Sprint 1 blockers.

## Risk register update

| Risk | Sprint 1 position | Follow-up |
|---|---|---|
| RQ-1: collecting unnecessary patient identity data | Resolved | Keep internal UUID identity and do not add National ID |
| RQ-2: concurrent booking or queue mutations | Reduced | Retain transaction and E2E concurrency coverage |
| RQ-3: clinical data exposure | Reduced | Keep role/ownership checks, private MinIO, and audit tests |
| RQ-4: AI availability or incorrect answers | Controlled | Keep bounded timeout, sources, and unavailable response |
