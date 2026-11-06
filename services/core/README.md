# Core service (the Core Backend)

The NestJS core backend: the six business modules, live updates and events, in one app. This README also covers the service's own files here and in `src/`.

**Rule:** Only reachable inside the Docker network, through the gateway's auth check. Still checks that every record belongs to the requesting user.

## Files

- `package.json`: dependencies and scripts (`start:dev`, `build`, `lint`, `test`, `test:e2e`). `postinstall` generates the Prisma client into `src/generated/` (gitignored).
- `Dockerfile`: the service image. Builds from the repo root; copies `schema.prisma` in so install can generate the client.
- `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`: Nest and TypeScript settings.
- `vitest.config.ts`, `vitest.config.e2e.ts`: unit tests (`src/**/*.spec.ts`) and end-to-end tests (`test/*.e2e-spec.ts`).
- `.oxlintrc.json`, `.prettierrc`: lint and formatting rules. Lint skips `src/generated/`.
- `src/main.ts`: starts the service on `PORT` (3000).
- `src/app.module.ts`: the root module: the shared module, the feature modules, health.
- `src/health.controller.ts`: `GET /health`, for Docker and Uptime Kuma. Test: `health.controller.spec.ts`.
- `test/app.e2e-spec.ts`: end-to-end test for the health endpoint.
- `test/booking.e2e-spec.ts`: booking against a real, migrated database (simultaneous bookings, record ownership, audit log, DB grants). Skipped unless `DATABASE_URL` (as `wasla_core`) and `SEED_DATABASE_URL` (as `wasla_migrator`) are set; use a throwaway database. CI's `database` job runs it; to run it yourself, follow that job's steps in `.github/workflows/ci.yml`.
- `test/queue.e2e-spec.ts`: check-in and the queue against a real, migrated database (simultaneous check-ins and call-next presses, each doctor's own line, record ownership, audit log). Same setup and skip rule as the booking test.
- `test/journey.e2e-spec.ts`: patient journey against a real, migrated database (`BOOKED` → `CHECKED_IN` → `WITH_DOCTOR` → `TEST_ORDERED` → `RESULT_READY` → `DONE`, bilingual stage rows in `core.journey_stages`, location resolution, record ownership, audit log). Same setup and skip rule as the booking test.
- `src/generated/`: the Prisma client, generated on install. Never edit it.
