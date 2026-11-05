# Authentication

Logging in and out: login, OTP codes and the simulated SMS provider, sessions (Postgres, `auth.sessions`), logout, password recovery, lockout, and rate limits for login and OTP.

## Files

- `authentication.module.ts`: the module. Exports `OtpService` and `SessionService` to identity and authorization.
- `authentication.controller.ts`: `POST /auth/login`, `/auth/logout`, `/auth/verify-phone`, `/auth/resend-code`, `GET /auth/me`.
- `authentication.service.ts`: login (same answer for every failure, all audited), logout, the current user, phone verification and resending codes. Test: `authentication.service.spec.ts`.
- `session.service.ts`: creates, checks and ends sessions (7 days; only the token's hash is stored), and `bearerToken()`. Test: `session.service.spec.ts`.
- `otp.service.ts`: 6-digit codes and the simulated SMS (logged and returned to the app): 10 minutes, 5 wrong guesses, 3 per hour. Test: `otp.service.spec.ts`.
- `password.ts`: argon2id hashing and checking.
- `dto/authentication.dto.ts`: request bodies and the phone format.

Still to come: password recovery and lockout (KAN-24).
