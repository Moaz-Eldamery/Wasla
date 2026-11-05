# Wasla

Hospital visit app: a patient mobile app, a staff website and the backend behind them. How the repo works: `CLAUDE.md`. Layout and stack: `structure.md`.

## What you need

- Node 24.18+ (`nvm use` reads `.nvmrc`), with pnpm (`corepack enable` sets up the version in `package.json`)
- Docker Desktop (or Docker Engine with Compose)
- uv (Python), only if you work on the AI service

## Run the whole system

```sh
cp .env.example .env          # fake values; fine for your own machine
docker compose up --build
```

- **Gateway:** http://localhost:8080. `/auth/*` goes to the auth service, everything else to the core.
- **Uptime Kuma:** http://localhost:3001 (set up the monitors there).

`database/init.sh` only runs on an empty database. The `migrate` service then applies the migrations before auth and core start. To start over, run `docker compose down -v`.

## Work on one part

```sh
pnpm install
pnpm --filter @wasla/hospital-dashboard dev   # staff website
pnpm --filter @wasla/patient-app start        # patient app (Expo)
pnpm --filter @wasla/auth start:dev           # auth service
pnpm --filter @wasla/core start:dev           # core service
cd services/ai && uv sync && uv run uvicorn app.main:app --reload   # AI service
```

## Mock API

```sh
pnpm mock    # fake API from contracts/openapi.yaml on http://localhost:4010
```

## Lint and test (what CI runs)

```sh
pnpm lint && pnpm test && pnpm test:e2e && pnpm build
# core tests against a real database: see services/core/README.md
cd services/ai && uv run ruff check . && uv run pytest
```
