# Clinical care module (IClinical)

Visit notes, test orders, lab results and releasing them to the patient.

**Rule:** Other modules use this one only through its public service. Patients never see a result before the doctor releases it.

## Files

- `clinical.module.ts`: registers and exports `ClinicalService` and `VisitNotesService`, the public services of IClinical.
- `clinical.controller.ts`: the eight test/result endpoints in `contracts/openapi.yaml`, with role guards, bounded multipart uploads and private streamed downloads.
- `clinical.service.ts`: orders and lists tests, starts processing, stores/replaces results and releases them to the patient. Row locks serialize test mutations and result reads; state changes and their audit entries commit together. Replaced or uncommitted objects are removed from private storage.
- `clinical.dto.ts`: validates test orders and the lab status filter.
- `clinical.views.ts`: explicit database selections and contract response mapping; object keys never leave the service, and patient views hide unreleased file metadata.
- `result-upload.ts`: the inclusive 10 MB limit, PDF/JPEG/PNG signature and MIME checks, and safe file names. Test: `result-upload.spec.ts`.
- `clinical.service.spec.ts`: patient visibility, storage/audit failures, release requirements and replacement cleanup tests.

- `visit-notes.controller.ts`: doctor latest/save/history endpoints and the patient's summary endpoint, with role checks and private/no-store response headers.
- `visit-notes.service.ts`: appends complete note snapshots without changing older rows. Locks the appointment before comparing `baseVersion`, returning `VERSION_CONFLICT` for stale edits. Audits reads and writes transactionally; unexpected database errors are redacted before logging. The patient path fetches only the latest summary and only for their own completed visit.
- `visit-notes.dto.ts`: validates the base version, clinical text (1–20,000 characters) and optional patient summary (up to 5,000). An omitted or null summary is stored as null in the new snapshot.
- `visit-notes.views.ts`: explicit doctor-view selections and contract response mapping; selects only the allowed author name from accounts.
- `visit-notes.service.spec.ts`: snapshot/version conflicts, summary isolation, completion gating, audited reads and error redaction.
