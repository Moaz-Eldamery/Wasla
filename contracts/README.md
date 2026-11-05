# API contract

The agreed API that every app and service follows. The fake server reads it, and each frontend generates its `lib/api-types.ts` from it.

**Rule:** Change the contract first, then the code. CI fails if the generated types are out of date.

## Files

- `openapi.yaml`: every endpoint the apps and the gateway use, with request, response and errors. Each operation names the service that serves it (`x-service`) and who may call it (`x-roles`). The top of the file holds the forward-auth contract (what `GET /auth/check` returns and which `X-User-*` headers reach the core) and the rules every endpoint follows. `pnpm mock` serves it on port 4010.
- `events.md`: live-update messages and internal events. Planned (KAN-27).
