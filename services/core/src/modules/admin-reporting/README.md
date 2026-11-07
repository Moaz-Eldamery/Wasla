# Admin & reporting module (IAdmin)

Departments, clinics, staff assignments, hospital statistics and the audit log viewer: everything under `/admin/*` except the assistant. Admins only.

**Rule:** Other modules use this one only through its public services. Statistics are counts and averages only, never patient names. Accounts are read only through the columns `wasla_core` may see (never email). Every change is audited in the same transaction.

## Files

- `admin-reporting.module.ts`: the module.
- `admin.controller.ts`: every `/admin/*` route here, all `@Roles('ADMIN')`.
- `admin.dto.ts`: request bodies and queries (bilingual names, clinic details, statistics range, audit filters).
- `hospital-setup.service.ts`: departments and clinics (add, edit, deactivate, reactivate; never delete) and who works in each clinic. Only active staff with a clinic role can be assigned. Departments come in a fixed order: clinical, lab, radiology, each by English name. Test: `hospital-setup.service.spec.ts` (KAN-36).
- `statistics.service.ts`: visits per clinical department, average wait and no-show rate per Cairo day, with totals for the range (definitions in `business.md`). Test: `statistics.service.spec.ts` (KAN-39).
- `audit-log.service.ts`: searches the audit log by who, action and Cairo days, newest first, 50 per page, paged by id. Test: `audit-log.service.spec.ts` (KAN-62).
- `audit-actions.ts`: maps the dotted action names the services store (`auth.login`, `appointment.check_in`, ...) to the contract's `AuditAction`, and back for the filter. Add a new stored name here, or it shows as `OTHER`.

Against a real database: `test/admin.e2e-spec.ts`.
