# Contract drafts

Endpoints a frontend is built against before the team has agreed them. They follow every rule in `../openapi.yaml` and reuse its schemas, but no backend serves them yet.

**Rule:** A draft is not the contract. When a backend card implements a draft endpoint, it first moves the endpoint into `openapi.yaml` (changing it where it needs to) and deletes it from here; the frontend then switches its types to `api-types.ts`.

## Files

- `admin.yaml`: the admin screens (KAN-20): staff and roles (`/auth/staff`, auth service), departments, clinics and assignments (`/admin/departments`, `/admin/clinics`), statistics (`/admin/statistics`) and the audit log (`/admin/audit-log`), all core service and `ADMIN` only. Taken by KAN-36 (staff and hospital setup), KAN-39 (statistics) and KAN-62 (audit log). The dashboard generates `src/lib/admin-api-types.ts` from it, and `pnpm mock` serves it with example data.
