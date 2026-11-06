# Lab and radiology pages

Screens for lab and radiology staff: the list of ordered tests, starting a test, uploading results.

## Files

- `LabPage.tsx`: `/lab` (KAN-19), the worklist for the user's lab and radiology clinics, oldest first.
  - **Tabs:** To start, In progress and Sent to doctor, each with a count. Released tests drop off the list.
  - **Waiting time:** each test shows how long it has waited, in amber after an hour.
  - **Side panel:** selecting a test opens it with the doctor's instructions and the next action: **Start test**, then send the result. A sent file can be viewed or replaced until the doctor releases it.
- `ResultUpload.tsx`: pick, check, then send. Drop or choose a file and it's checked right away (PDF, JPEG or PNG, at most 10 MB), with a preview for images and a reminder to check the patient and test. Nothing is sent until **Send to doctor**.
- `resultFile.ts`: `checkResultFile()` (the API's file rules) and `formatBytes()`, also used by the doctor's tests panel.
- `LabPage.test.tsx`:
  - file rules
  - tabs, counts and waiting times
  - Start test
  - refusing a wrong or oversized file without sending
  - sending as a multipart upload
  - replacing a sent file
