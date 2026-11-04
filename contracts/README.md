# API contract

The agreed API that every app and service follows. The fake server reads it, and each frontend generates its `lib/api-types.ts` from it.

**Rule:** Change the contract first, then the code. CI fails if the generated types are out of date.

## Files

_None yet._ Planned: `openapi.yaml` (every endpoint: request, response, errors) and `events.md` (live-update messages and internal events), KAN-4.
