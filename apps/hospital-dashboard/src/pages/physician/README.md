# Doctor pages

Screens for doctors: today's patients, call next, visit notes, ordering tests, releasing results; later the to-do list and AI explanation review.

## Files

- `DoctorPage.tsx`: `/doctor` (KAN-18). It shows:
  - **The doctor's day on the day book**, without the doctor column.
  - **Call next patient** for the chosen clinic, with a count of who's waiting. It stays disabled while a visit is in progress.
  - **The visit panel beside the day.** With no visit in progress, it shows the clinic's queue. A finished visit can be opened from the day with **Open**.
- `VisitPanel.tsx`: one visit. The header holds the patient and **Finish visit**, which warns first when no notes are saved. Below it are two tabs: Notes, and Tests and results.
- `NotesEditor.tsx`: clinical notes and the patient summary, with an explicit **Save**. Every save is a new version, sent with `baseVersion`.
  - **Drafts:** the unsaved draft survives a reload in this tab only (sessionStorage), and the browser warns before leaving with unsaved changes.
  - **Conflicts:** on `409 VERSION_CONFLICT` it keeps the doctor's text and shows the newer version.
- `TestsSection.tsx`: the visit's tests, with status chips.
  - **Results:** **View result** opens the private file in a new tab. **Release to patient** asks for confirmation first.
  - **Ordering:** the order form (a lab or radiology clinic, the test, instructions) shows only while the patient is with the doctor.
- `DoctorPage.test.tsx`: the page against a fake gateway:
  - call next
  - first notes save, and a save conflict
  - ordering a test
  - releasing a result
  - the warning before finishing without notes
