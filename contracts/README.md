# API contract

The agreed API that every app and service follows. The fake server reads it, and each frontend generates its `lib/api-types.ts` from it.

**Rule:** Change the contract first, then the code. CI fails if the generated types are out of date.

## Files

- `openapi.yaml`: every endpoint the apps and the gateway use, with request, response and errors. Each operation names the service that serves it (`x-service`) and who may call it (`x-roles`). The top of the file holds the forward-auth contract (what `GET /auth/check` returns and which `X-User-*` headers reach the core) and the rules every endpoint follows. `pnpm mock` serves it on port 4010.
- `mock.mjs`: what `pnpm mock` runs. Prism reads one document, so it joins `openapi.yaml` and every file in `drafts/` into a temporary file (stopping if a draft repeats a contract path or schema) and serves that on port 4010. Only on the mock, login and `GET /auth/me` answer as a staff member with every role, so each staff screen can be opened.
- `drafts/`: endpoints a frontend is built against before they are agreed (see `drafts/README.md`).
- `events.md`: live-update messages and internal events. Planned (KAN-27).
