# Authorization check

The check Traefik calls before every protected request: is there a valid session, is the account active, what are the roles. It returns the user ID, type and roles for the gateway to pass on.

**Rule:** Fails closed: on any error or doubt, the request is refused.

## Files

- `authorization.controller.ts`: `GET /auth/check`, the gateway's forward-auth endpoint. Refuses every request (401) until sessions exist (KAN-7). On success it will answer 200 with `X-User-Id`, `X-User-Type` and `X-User-Roles`.
- `authorization.controller.spec.ts`: checks that it refuses requests.
