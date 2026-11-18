# Sprint 1 test report

This report records the acceptance evidence for KAN-64. Test counts below are
updated from the latest local run; skipped tests are not counted as passed.

## Coverage

- Equivalence partitioning and boundary cases: phone, OTP, booking, and the
  exact 10 MB result-file limit.
- State transitions: booking, check-in, consultation, completion, no-show,
  cancellation, test processing, and journey stages.
- Concurrency: booking, check-in, call-next, test start/upload/release.
- Ownership and role boundaries: patient, doctor, receptionist, lab/radiology,
  and admin access.

## Latest verification — 2026-11-18

- Monorepo lint: passed; two pre-existing Fast Refresh warnings in
  `apps/hospital-dashboard/src/session.tsx`.
- Patient App: 16/16 tests passed.
- Hospital Dashboard: 85/85 tests passed.
- Auth unit tests: 57/57 passed.
- Core unit tests: 134/134 passed.
- AI checks: ruff and format passed; 29/29 pytest tests passed.
- Auth E2E: 2 passed, 15 skipped because the local throwaway database
  variables were not configured.
- Core E2E: 1 passed, 65 skipped for the same missing local database/MinIO
  configuration.
- Dashboard, Auth, and Core production builds: passed.

Skipped database E2E tests are not counted as passed. GitHub Actions runs the
same suites with the required isolated services.

## CI evidence

`.github/workflows/ci.yml` runs:

1. Monorepo lint, unit tests, E2E tests, and builds.
2. Auth and Core E2E tests against migrated Postgres and private MinIO.
3. AI lint/tests and the Core-to-AI integration suite.
4. Docker Compose configuration, health, gateway, and registration smoke
   checks.
