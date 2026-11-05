# Changelog

Every change to the codebase, newest first. New entries go at the top. Never edit old entries.

Entry format:

```
## C-0000 · YYYY-MM-DD HH:MM +0200
Prompt: P-0000
What: one or two plain sentences on what changed and why
Files: path/one, path/two
```

---

## C-0012 · 2026-11-05 09:57 +0200
Prompt: P-0018
What: Added the CI workflow (KAN-5). It runs on every pull request and on main, with three jobs:
- `node`: lint, unit tests, e2e tests and build for the JS/TS packages.
- `ai`: ruff and pytest for the AI service.
- `stack`: starts the whole stack with docker compose. It checks that /auth/health answers through the gateway and that core routes get 401 without a session.
Files: .github/workflows/ci.yml, .github/workflows/README.md

## C-0011 · 2026-11-05 09:57 +0200
Prompt: P-0018
What: Added `pnpm mock`, which serves a fake API from contracts/openapi.yaml with Prism on port 4010 (KAN-5). Wrote a starter openapi.yaml for it. It describes only the endpoints that exist so far: the auth and core health checks and the gateway's auth check. KAN-4 adds the rest.
Files: package.json, pnpm-lock.yaml, contracts/openapi.yaml, contracts/README.md

## C-0010 · 2026-11-05 09:57 +0200
Prompt: P-0018
What: The whole stack now starts with one command, `docker compose up --build` (KAN-5).
- **Services:** Traefik, Postgres with pgvector, Redis, MinIO with a one-off job that creates the private results bucket, Uptime Kuma, and the auth, core and AI services. Each service has its own Dockerfile, built from the repo root.
- **Gateway:** Traefik is configured with labels. `/auth/*` goes to the auth service; everything else goes to the core after a forward-auth check. Every route strips client-sent `X-User-*` headers and has a per-IP rate limit and an 11 MB body limit.
- **Networks:** four of them, so only the gateway (and Uptime Kuma, on localhost) has a published port, only the core can reach the AI service, and the data services have no internet.
- **Database:** `database/init.sh` creates `wasla_clinical` (auth + core schemas) and `wasla_ai` (with pgvector). It also creates one DB user per service, plus a `wasla_migrator` user that owns the clinical tables and runs Prisma migrations, so runtime users can't change the schema. schema.md now lists every DB user and its default rights.
- **MinIO image:** MinIO stopped publishing free images, so the stack uses the community build pgsty/minio. The user chose it.
- **Other files:** `.env.example` lists every variable with fake values. `.gitattributes` keeps *.sh on LF line endings.
- **Verified locally:**
  - Every container comes up healthy, both on the first start and after a full reset.
  - Routing and the 401 answer for core routes work, as do the body limit and the rate limit.
  - Network isolation holds, every DB grant behaves as schema.md says, and the bucket is private.
Files: docker-compose.yml, .env.example, .dockerignore, .gitattributes, .gitignore, database/init.sh, database/README.md, services/auth/Dockerfile, services/core/Dockerfile, services/ai/Dockerfile, schema.md, structure.md, README.md

## C-0009 · 2026-11-05 09:57 +0200
Prompt: P-0018
What: Scaffolded every app and service where structure.md says (KAN-5). Generators ran outside the repo and their files were copied in, without the demo content or the generator extras (AGENTS.md, a LICENSE, a nested .git).
- **auth and core (NestJS 12):** each has a `/health` route. The auth service's routes live under `/auth`. Its `/auth/check` is the gateway's auth check, and it refuses everything until KAN-7 adds sessions, so it fails closed.
- **hospital-dashboard (Vite + React):** a placeholder page.
- **patient-app (Expo SDK 58 + expo-router):** a placeholder start screen. Its test sits outside `app/`, because expo-router turns every file there into a screen.
- **ai (FastAPI, uv):** a `/health` route.
- **Tests and lint:**
  - auth, core and the dashboard: oxlint and Vitest.
  - patient app: oxlint, tsc and jest-expo.
  - AI service: ruff and pytest.
  - Every package has a smoke test. The root `pnpm lint`, `pnpm test`, `pnpm test:e2e` and `pnpm build` run them all.
- **pnpm settings:** the root package.json pins pnpm 11.6.0. pnpm-workspace.yaml denies install scripts for @scarf/scarf (telemetry) and @parcel/watcher (it ships prebuilt binaries).
Files: package.json, pnpm-workspace.yaml, pnpm-lock.yaml, apps/hospital-dashboard/**, apps/patient-app/**, services/auth/**, services/core/**, services/ai/**, the READMEs of each of these folders, structure.md, README.md

## C-0008 · 2026-11-04 18:01 +0200
Prompt: P-0015
What: Replaced every .gitkeep with a README.md that explains the folder (purpose, rules, files, and which cards fill it). Added READMEs to database/ and the root of each app and service too, since files go there directly; 37 in total. CLAUDE.md now treats folder READMEs as project files: read the README of each folder before working in it, and update it whenever a file in that folder is added, renamed, deleted or changes what it does (new loop step 9). structure.md describes which folders have a README, what each covers and the format.
Files: 37 × */README.md (new), 31 × */.gitkeep (removed), CLAUDE.md, structure.md

## C-0007 · 2026-11-04 17:56 +0200
Prompt: P-0014
What: Created the empty folder skeleton for every folder listed in structure.md (31 leaf folders, each with a .gitkeep so git tracks it), at the user's request. Changed the structure.md rule from "folders appear only with their first file" to "every listed folder exists; delete the .gitkeep when the folder gets its first real file", added a rule that scaffolding tools must not wipe the existing folders, and updated the status markers (all folders exist; only files are still planned).
Files: .github/workflows/, contracts/, database/**, apps/**, services/**, structure.md

## C-0006 · 2026-11-04 17:39 +0200
Prompt: P-0013
What: Agreed a fixed file structure (grill-me session) and wrote it into structure.md, with a new "Changing the structure" section: no directory is created, moved or deleted without asking, folders appear only when their first real file is written, and no .gitkeep placeholders. Deleted all 48 empty placeholder folders. Decisions: apps/ + services/ grouping; Traefik configured in docker-compose.yml (no gateway folder); contracts/ at the root replaces packages/ (each frontend generates its own api-types.ts); database/ = init.sh + clinical/ + ai/; core uses src/modules/ plus realtime/, events/, shared/; auth has authentication/, authorization/, identity/ directly in src/; AI has 4 feature folders + llm.py + privacy.py; frontends get routes/pages + lib/ + translations/; everything else follows framework defaults.
Files: apps/ (removed), services/ (removed), database/ (removed), packages/ (removed), structure.md, schema.md, pnpm-workspace.yaml

## C-0005 · 2026-11-04 17:35 +0200
Prompt: P-0011
What: Made CLAUDE.md process-only so it no longer changes when the codebase does. Moved the architecture and stack section into structure.md and the "always apply" rules into business.md (adding the two that weren't there yet). Replaced the hard-coded schema path with a pointer to structure.md, and added rule 5: never put project facts in CLAUDE.md.
Files: CLAUDE.md, structure.md, business.md

## C-0004 · 2026-11-04 17:33 +0200
Prompt: P-0010
What: Removed docs/ (not in the spec) and infra/. Added database/ to hold everything database-related: init/ (creates databases, schemas and DB users), clinical/ (Prisma schema + migrations, moved from packages/db) and ai/ (wasla_ai migrations, moved from services/ai/migrations). MinIO, Redis and monitoring become docker-compose entries instead of folders. Updated paths in the project files.
Files: docs/ (removed), infra/ (removed), packages/db/ (moved), services/ai/migrations/ (moved), database/**, structure.md, schema.md, CLAUDE.md

## C-0003 · 2026-11-04 17:27 +0200
Prompt: P-0008
What: Created the agreed folder structure (empty folders with .gitkeep) for the two clients, the gateway, auth, core and AI services, shared packages and infra, plus the pnpm workspace root and .gitignore. Recorded the architecture: Traefik gateway with forward-auth, separate auth service, one clinical database with auth + core schemas and a separate AI database, each service with its own DB user. structure.md now maps each design component to its folder and lists where the prototype differs from the Milestone 1 design (risk TR-1).
Files: apps/**, services/**, packages/**, infra/**, docs/, package.json, pnpm-workspace.yaml, .gitignore, structure.md, schema.md, CLAUDE.md

## C-0002 · 2026-11-04 15:25 +0200
Prompt: P-0003
What: Prompt log entries now record who wrote the prompt (Author, taken from `git config user.name`); added that step to the CLAUDE.md loop and backfilled P-0001 and P-0002. Also flipped both logs to newest-first to match the CLAUDE.md edit, and changed the "next ID" rule to read the top entry.
Files: CLAUDE.md, prompt_log.md, changelog.md

## C-0001 · 2026-11-04 15:00 +0200
Prompt: P-0001
What: Added the agent workflow. CLAUDE.md explains the five project files and the update loop the agent follows on every prompt. Created starter versions of business.md (rules taken from the agreed backlog), schema.md (empty, no tables yet), structure.md, changelog.md and prompt_log.md.
Files: CLAUDE.md, business.md, schema.md, structure.md, changelog.md, prompt_log.md
