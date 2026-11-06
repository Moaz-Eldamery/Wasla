# CI workflows

GitHub Actions workflows. GitHub only runs workflows from this exact folder.

## Files

- `ci.yml`: runs on every pull request and on `main`. Four jobs:
  - `node`: lint, unit tests, e2e tests and build for the apps, auth and core. Tests that need a database are skipped here.
  - `database`: starts Postgres with `database/init.sh`, applies the migrations as `wasla_migrator`, loads the demo data, then runs the auth e2e tests as `wasla_auth` and the core's as `wasla_core`. Starts private MinIO for the clinical workflow tests. Covers sign-up/login, simultaneous bookings, check-in/queue, journey, test orders, private result uploads/release/download, ownership, audit logs and DB grants.
  - `ai`: ruff and pytest for the AI service.
  - `stack`: starts the whole stack with `docker compose`. It checks that `/auth/health` answers through the gateway, that core routes are refused without a session, and that a patient can sign up, log in and reach the core with their session.
