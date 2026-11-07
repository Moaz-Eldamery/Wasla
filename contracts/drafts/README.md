# Contract drafts

Endpoints a frontend is built against before the team has agreed them. They follow every rule in `../openapi.yaml` and reuse its schemas, but no backend serves them yet.

**Rule:** A draft is not the contract. When a backend card implements a draft endpoint, it first moves the endpoint into `openapi.yaml` (changing it where it needs to) and deletes it from here; the frontend then switches its types to `api-types.ts`.

## Files

_None open._ The admin draft (`admin.yaml`, KAN-20) moved into `openapi.yaml` when KAN-36, KAN-39 and KAN-62 built its endpoints, with staff work emails and the audit actions the services really write.
