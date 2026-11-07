# Backend calls (patient app)

The only code in the app that talks to the backend, always through the gateway.

**Rule:** Screens never call the server directly; they use these files. `api-types.ts` is generated from `contracts/openapi.yaml`, so never edit it by hand.

## Files

- `api-types.ts`: TypeScript types generated from `contracts/openapi.yaml` (`pnpm --filter @wasla/patient-app generate:api-types`); checked in `pnpm lint`.
- `api.ts`: gateway HTTP client, session token state, and typed calls for auth (`registerPatient`, `verifyPhone`, `resendVerificationCode`, `login`, `logout`, `fetchMe`), booking (`listDepartments`, `listDepartmentDoctors`, `listDoctorFreeSlots`, `bookAppointment`, `listMyAppointments`), queue (`getQueuePosition`), journey (`getAppointmentJourney`), and results and visit summaries (`listMyResults`, `downloadTestResult`, `getVisitSummary`). `downloadTestResult` saves the file's bytes to the app's private cache (`results/<testId>.<pdf|jpg|png>`); `clearDownloadedResults` empties that folder and runs whenever the session ends. Defaults to `http://localhost:8080` and supports `EXPO_PUBLIC_API_URL` (e.g. `http://localhost:4010` for `pnpm mock`).
- `socket.ts`: live-update connection helper routed via the gateway (live events arrive in KAN-27).

