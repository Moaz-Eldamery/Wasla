# Backend calls (dashboard)

The only code in the dashboard that talks to the backend, always through the gateway.

**Rule:** Pages never call the server directly; they use these files. `api-types.ts` is generated from `contracts/openapi.yaml`, so never edit it by hand.

## Files

_None yet._ Planned: `api.ts`, `socket.ts`, `api-types.ts` (KAN-17).
