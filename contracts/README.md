# API contract

The agreed API that every app and service follows. The fake server reads it, and each frontend generates its `lib/api-types.ts` from it.

**Rule:** Change the contract first, then the code. CI fails if the generated types are out of date.

## Files

- `openapi.yaml`: every endpoint (request, response, errors) as seen through the gateway. `pnpm mock` serves it on port 4010. So far it holds only the health endpoints and the gateway's auth check (KAN-5); KAN-4 adds the rest.
- Planned: `events.md` (live-update messages and internal events), KAN-4.
