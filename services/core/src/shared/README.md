# Shared code

Code several modules use, as files (not sub-folders): the database client, who is calling and the role check, the audit log writer, the error format, Cairo time, and later file storage (MinIO) and the AI service client.

**Rule:** Only the AI client here talks to the AI service.

## Files

- `shared.module.ts`: global module. Provides the database client and audit writer, and turns on the role guard, the error filter and request validation for every route.
- `prisma.service.ts`: the database client, connected as `wasla_core`. Only `select` the allowed account columns (see the file).
- `caller.ts`: reads the gateway's `X-User-*` headers into a `Caller`, `hasRole()`, and the `@CurrentCaller()` parameter decorator. Test: `caller.spec.ts`.
- `roles.guard.ts`: `@Roles(...)` and the guard behind it: 401 without valid identity headers, 403 (audited) for the wrong role.
- `audit.service.ts`: appends to `core.audit_log`, optionally inside a transaction.
- `api-error.ts`: `ApiError` (the contract's error body), `notFound()`, and `IdPipe` for `:id` parameters.
- `api-exception.filter.ts`: turns every error into the contract's error body; unknown errors become 500 `INTERNAL`.
- `cairo-time.ts`: Cairo calendar days ↔ UTC instants, daylight saving included. Test: `cairo-time.spec.ts`.
- `clinic.views.ts`: the contract's `Clinic` shape, `clinicSelect` and `toClinicView()`, used by every module that returns a clinic (appointments, patient journey).

Still to come: file storage (KAN-10) and the AI service client (KAN-22).
