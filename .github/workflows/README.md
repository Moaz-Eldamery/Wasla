# CI workflows

GitHub Actions workflows. GitHub only runs workflows from this exact folder.

## Files

- `ci.yml`: runs on every pull request and on `main`. Four jobs:
  - `node`: lint, unit tests, e2e tests and build for the apps, auth and core. Tests that need a database are skipped here.
  - `database`: starts Postgres with `database/init.sh`, applies the migrations as `wasla_migrator`, then runs the core's e2e tests as `wasla_core`, including the ones that need a real database (simultaneous bookings, record ownership, audit log, DB grants).
  - `ai`: ruff and pytest for the AI service.
  - `stack`: starts the whole stack with `docker compose`. It checks that `/auth/health` answers through the gateway and that core routes are refused without a session.
