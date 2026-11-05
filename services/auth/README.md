# Auth service (the Auth Layer)

Its own NestJS service: login, sessions and the check the gateway runs before every protected request. This README also covers the service's own files here and in `src/`.

**Rule:** The only service that reads password hashes, sessions or OTP codes. Every route lives under `/auth`, because the gateway passes `/auth/*` through unchanged.

## Files

- `package.json`: dependencies and scripts (`start:dev`, `build`, `lint`, `test`, `test:e2e`). `postinstall` generates the Prisma client into `src/generated/` (gitignored).
- `Dockerfile`: the service image. Builds from the repo root; copies `schema.prisma` in so install can generate the client.
- `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`: Nest and TypeScript settings.
- `vitest.config.ts`, `vitest.config.e2e.ts`: unit tests (`src/**/*.spec.ts`) and end-to-end tests (`test/*.e2e-spec.ts`).
- `.oxlintrc.json`, `.prettierrc`: lint and formatting rules. Lint skips `src/generated/`.
- `src/main.ts`: starts the service on `PORT` (3000), with the `/auth` prefix.
- `src/app.module.ts`: the root module; also exports the `/auth` prefix. Turns on request validation and the error filter, and provides the database client and audit writer to every module.
- `src/prisma.service.ts`: the database client, connected as `wasla_auth`.
- `src/audit.service.ts`: writes login events to `core.audit_log` (insert-only for this service), and `clientIp()`.
- `src/api-error.ts`, `src/api-exception.filter.ts`: the contract's error body, including `Retry-After` on 429.
- `src/generated/`: the Prisma client, generated on install. Never edit it.
- `src/health.controller.ts`: `GET /auth/health`, for Docker and Uptime Kuma. Test: `health.controller.spec.ts`.
- `test/app.e2e-spec.ts`: end-to-end tests for the health endpoint and the auth check without a session.
- `test/auth.e2e-spec.ts`: sign-up, login, the auth check and logout against a real, migrated database, plus the code limits, deactivation and DB grants. Skipped unless `DATABASE_URL` (as `wasla_auth`) and `SEED_DATABASE_URL` (as `wasla_migrator`) are set; CI's `database` job runs it.
