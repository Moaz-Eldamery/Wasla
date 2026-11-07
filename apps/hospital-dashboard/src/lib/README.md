# Backend calls (dashboard)

The only code in the dashboard that talks to the backend, always through the gateway.

**Rule:** Pages never call the server directly; they use these files. `api-types.ts` is generated from `contracts/openapi.yaml`, so never edit it by hand.

## Files

- `api.ts`: the fetch wrapper and one function per endpoint the website uses so far (reception, and since KAN-18 the doctor's day, call next, finish, notes, tests, release and the result file; since KAN-19 the lab worklist, start and the multipart result upload; since KAN-20 the admin screens: the assistant `askChatbot`, staff and roles, departments, clinics and assignments, statistics and the audit log). It handles:
  - **Session:** the token lives in sessionStorage, so it ends with the tab.
  - **Errors:** contract errors become `ApiError` with their `code`, and an unreachable server is status 0.
  - **Expired sessions:** a 401 ends the session.
  - **Base URL:** `VITE_API_URL`, default `/api`.
  - Test: `api.test.ts`.
- `api-types.ts`: TypeScript types generated from the contract (`pnpm --filter @wasla/hospital-dashboard generate:api-types`); checked in `lint`.
- Planned: `socket.ts` for live updates (KAN-27).
