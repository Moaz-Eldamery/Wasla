# Identity

Accounts: patient registration, profile and emergency contact, phone change, staff accounts.

**Rule:** Staff routes are for admins only. `/auth/*` comes through the gateway without its auth check, so `AdminGuard` checks the session and the `ADMIN` role itself (401, then an audited 403) before any validation runs.

## Files

- `identity.module.ts`: the module.
- `identity.controller.ts`: `POST /auth/register`.
- `identity.service.ts`: patient sign-up: creates an unverified patient (or starts an unverified one over) and sends a code. Test: `identity.service.spec.ts`.
- `dto/register.dto.ts`: the sign-up body.
- `staff.controller.ts`: `GET` and `POST /auth/staff`, `PUT /auth/staff/{id}/roles`, `POST /auth/staff/{id}/deactivate` and `/reactivate` (KAN-36).
- `staff.service.ts`: staff accounts: list and search (name, email, phone), add with a one-time temporary password (only its hash is stored), change roles, deactivate (revokes every session in the same transaction) and reactivate. An admin can't deactivate themselves or drop their own admin role. Every change is audited (`staff.*`). Test: `staff.service.spec.ts`; against a real database: `test/staff.e2e-spec.ts`.
- `admin.guard.ts`: `AdminGuard` and `@CurrentAdmin()`: only a signed-in admin gets through.
- `dto/staff.dto.ts`: the staff list query, the new-staff body and the roles body.

Still to come: profile editing (KAN-24).
