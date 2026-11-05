# Core service (the Core Backend)

The NestJS core backend: the six business modules, live updates and events, in one app. This README also covers the service's own files here and in `src/`.

**Rule:** Only reachable inside the Docker network, through the gateway's auth check. Still checks that every record belongs to the requesting user.

## Files

- `package.json`: dependencies and scripts (`start:dev`, `build`, `lint`, `test`, `test:e2e`).
- `Dockerfile`: the service image. Builds from the repo root.
- `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`: Nest and TypeScript settings.
- `vitest.config.ts`, `vitest.config.e2e.ts`: unit tests (`src/**/*.spec.ts`) and end-to-end tests (`test/*.e2e-spec.ts`).
- `.oxlintrc.json`, `.prettierrc`: lint and formatting rules.
- `src/main.ts`: starts the service on `PORT` (3000).
- `src/app.module.ts`: the root module.
- `src/health.controller.ts`: `GET /health`, for Docker and Uptime Kuma. Test: `health.controller.spec.ts`.
- `test/app.e2e-spec.ts`: end-to-end test for the health endpoint.
