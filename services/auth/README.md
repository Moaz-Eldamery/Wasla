# Auth service (the Auth Layer)

Its own NestJS service: login, sessions and the check the gateway runs before every protected request. This README also covers the service's own files here and in `src/`.

**Rule:** The only service that reads password hashes, sessions or OTP codes. Every route lives under `/auth`, because the gateway passes `/auth/*` through unchanged.

## Files

- `package.json`: dependencies and scripts (`start:dev`, `build`, `lint`, `test`, `test:e2e`).
- `Dockerfile`: the service image. Builds from the repo root.
- `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`: Nest and TypeScript settings.
- `vitest.config.ts`, `vitest.config.e2e.ts`: unit tests (`src/**/*.spec.ts`) and end-to-end tests (`test/*.e2e-spec.ts`).
- `.oxlintrc.json`, `.prettierrc`: lint and formatting rules.
- `src/main.ts`: starts the service on `PORT` (3000), with the `/auth` prefix.
- `src/app.module.ts`: the root module; also exports the `/auth` prefix.
- `src/health.controller.ts`: `GET /auth/health`, for Docker and Uptime Kuma. Test: `health.controller.spec.ts`.
- `test/app.e2e-spec.ts`: end-to-end tests for the health endpoint and the auth check.
