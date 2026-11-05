# Authorization check

The check Traefik calls before every protected request: is there a valid session, is the account active, what are the roles. It returns the user ID, type and roles for the gateway to pass on.

**Rule:** Fails closed: on any error or doubt, the request is refused.

## Files

- `authorization.module.ts`: the module.
- `authorization.controller.ts`: `GET /auth/check`, the gateway's forward-auth endpoint. A live session of an active account gets 200 with `X-User-Id`, `X-User-Type` and `X-User-Roles`; anything else is 401, and an error is a 5xx, so the gateway refuses either way.
- `authorization.controller.spec.ts`: the headers it sends, and that it refuses missing, dead or failing sessions.
