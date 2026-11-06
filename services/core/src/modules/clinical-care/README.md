# Clinical care module (IClinical)

Visit notes, test orders, lab results and releasing them to the patient.

**Rule:** Other modules use this one only through its public service. Patients never see a result before the doctor releases it.

## Files

- `clinical.module.ts`: registers and exports the public `ClinicalService` (IClinical).
- `clinical.controller.ts`: the eight test/result endpoints in `contracts/openapi.yaml`, with role guards, bounded multipart uploads and private streamed downloads.
- `clinical.service.ts`: orders and lists tests, starts processing, stores/replaces results and releases them to the patient. Row locks serialize test mutations and result reads; state changes and their audit entries commit together. Replaced or uncommitted objects are removed from private storage.
- `clinical.dto.ts`: validates test orders and the lab status filter.
- `clinical.views.ts`: explicit database selections and contract response mapping; object keys never leave the service, and patient views hide unreleased file metadata.
- `result-upload.ts`: the inclusive 10 MB limit, PDF/JPEG/PNG signature and MIME checks, and safe file names. Test: `result-upload.spec.ts`.
- `clinical.service.spec.ts`: patient visibility, storage/audit failures, release requirements and replacement cleanup tests.

Visit notes remain planned (KAN-11).
