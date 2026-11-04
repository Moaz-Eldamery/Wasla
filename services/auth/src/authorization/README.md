# Authorization check

The check Traefik calls before every protected request: is there a valid session, is the account active, what are the roles. It returns the user ID, type and roles for the gateway to pass on.

**Rule:** Fails closed: on any error or doubt, the request is refused.

## Files

_None yet._ Filled by KAN-7.
