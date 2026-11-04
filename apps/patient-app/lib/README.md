# Backend calls (patient app)

The only code in the app that talks to the backend, always through the gateway.

**Rule:** Screens never call the server directly; they use these files. `api-types.ts` is generated from `contracts/openapi.yaml`, so never edit it by hand.

## Files

_None yet._ Planned: `api.ts`, `socket.ts`, `api-types.ts` (KAN-14).
