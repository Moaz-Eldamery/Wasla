# CI workflows

GitHub Actions workflows. GitHub only runs workflows from this exact folder.

## Files

- `ci.yml`: runs on every pull request and on `main`. Three jobs:
  - `node`: lint, unit tests, e2e tests and build for the apps, auth and core.
  - `ai`: ruff and pytest for the AI service.
  - `stack`: starts the whole stack with `docker compose`. It checks that `/auth/health` answers through the gateway and that core routes are refused without a session.
