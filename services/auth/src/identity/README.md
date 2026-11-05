# Identity

Accounts: patient registration, profile and emergency contact, phone change, staff accounts.

## Files

- `identity.module.ts`: the module.
- `identity.controller.ts`: `POST /auth/register`.
- `identity.service.ts`: patient sign-up: creates an unverified patient (or starts an unverified one over) and sends a code. Test: `identity.service.spec.ts`.
- `dto/register.dto.ts`: the sign-up body.

Still to come: profile editing (KAN-24) and staff accounts (KAN-36).
