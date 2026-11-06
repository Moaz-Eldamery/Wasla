# Business logic

What Wasla does and the rules it follows. If code and this file disagree, ask before changing either one.

## Users and what they can see

| Role | Uses | Can see / do |
|---|---|---|
| Patient | Mobile app | Only their own appointments, queue position, journey, released results and visit summaries |
| Receptionist | Website | Appointments, check-in and queue for their assigned clinics. **No medical details** |
| Doctor | Website | Their own patients' visits: notes, test orders, results, releasing results |
| Lab / radiology | Website | Tests ordered for their department; uploads results |
| Admin | Website | Staff, departments, clinics, statistics, the AI chatbot. **No medical records** |

- Every request checks both the role **and** whether the record belongs to that user. Someone else's record returns "not found", so its existence isn't leaked.
- Important actions (logins, bookings, including failed ones, reading medical records, releasing results, role changes, refused access) are written to an audit log. The log can't be edited or deleted.

## Hospital setup
- A department has one or more clinics. A clinic is a place patients go (a clinic room, the lab, a radiology room) with a building, floor and directions in Arabic and English.
- Departments are clinical (patients book them), lab or radiology (they receive tests).
- An admin assigns each doctor, receptionist and lab staff member to one or more clinics. Staff work only with their assigned clinics.

## Accounts
- Patients register with name, phone number and password. The phone is verified with a 6-digit code. SMS is **simulated** in the prototype: the code is shown on screen and in the logs.
- Patients are identified by an internal ID, **not** a National ID.
- Staff accounts are created by an admin. Deactivating a staff member logs them out immediately.
- Everyone logs in with phone number and password. Staff don't get a phone code: the admin created their account.
- A session lasts 7 days from login; then the user logs in again. Logging out ends that session at once. A deactivated account can't log in, and its open sessions stop working at once.
- A phone code is valid for 10 minutes and allows 5 wrong guesses; after that the patient asks for a new one. At most 3 codes per phone number per hour.
- Signing up again with a number that was never verified starts over (new name, password and code). A verified number, or a staff member's, can't be used to sign up.
- Wrong phone, wrong password and deactivated account all get the same "wrong phone number or password" answer, and asking to resend a code answers the same way for every number, so nobody can find out who is registered.
- For now, login attempts are limited only by the gateway's per-IP limit. Locking an account after repeated failures comes with KAN-24.

## Booking
- Patients browse departments → doctors → free slots, then book one.
- Each slot has its own start and end time; there is no fixed slot length.
- A slot can only ever have one active booking. Two people booking at the same moment: one succeeds, the other is told the slot was taken.
- A patient's appointments are split into **upcoming** (booked and not over yet, or checked in or with the doctor right now) and **past** (everything else, including cancelled and no-shows).
- The receptionist's day list shows the clinic's appointments for one Cairo calendar day, without cancelled ones.
- Patients can cancel (the slot opens again) or move an appointment to another free slot.
- Staff create, block and cancel a doctor's slots. Patients affected by a staff cancellation are told why.

## A visit, step by step

Appointment status flow:

```
BOOKED → CHECKED_IN → IN_CONSULTATION → COMPLETED
BOOKED → CANCELLED
CHECKED_IN → NO_SHOW   (receptionist, with a reason)
```

Only these moves are allowed. For example, a visit can't be completed before it has started.

- **Check-in:** a receptionist of the appointment's clinic checks the patient in. Only on the appointment's own day (Cairo time), at any time that day, even after the slot has ended, so late arrivals are still seen. Any other day is refused.
- **Queue:** each doctor has their own line in a clinic: the patients booked with them who are checked in there, in check-in order (not slot order). A patient booked with one doctor is never called by another.
  - The doctor calls the next patient in their own line. A doctor sees one patient at a time, in any clinic: they finish the current visit before calling the next one. Pressing "call next" twice at once calls one patient.
  - Only the appointment's own doctor completes the visit.
  - The patient sees how many people are ahead of them in the same doctor's line, and an estimated wait. The estimate is always labelled as an estimate.
  - The clinic's queue board shows every doctor's waiting and in-consultation patients, each with their doctor. Receptionists and doctors assigned to the clinic can see it. No medical details.
- **Journey:** at every step the patient sees their current stage, what to do next and where to go (building, floor, directions). Stages and messages are stored as data in `core.journey_stages`, in Arabic and English:
  - `BOOKED` → appointment clinic
  - `CHECKED_IN` → appointment clinic
  - `TEST_ORDERED` (`IN_CONSULTATION` or `COMPLETED`, and an ordered test is still `REQUESTED` or `IN_PROGRESS`, so the patient still has to go to the lab) → that test's lab or radiology clinic
  - `RESULT_READY` (`IN_CONSULTATION`, no test left at the lab, and at least one test `RELEASED`) → appointment clinic
  - `WITH_DOCTOR` (`IN_CONSULTATION` otherwise: no tests, or tests `AWAITING_REVIEW`, where the lab is done and the patient goes back to the doctor) → appointment clinic
  - `DONE` (`COMPLETED` with no test left at the lab, or `CANCELLED` / `NO_SHOW`) → no location (`null`). A result still `AWAITING_REVIEW` reaches the patient once the doctor releases it.

## Tests and results
- A doctor orders a test during a visit. It goes to a clinic of the lab or radiology department, and the lab staff assigned to that clinic see it.
- Test status: `REQUESTED → IN_PROGRESS → AWAITING_REVIEW → RELEASED`
- The lab uploads a PDF or image (max 10 MB). Files are stored privately and are never public links.
- **The patient only sees a result after the doctor releases it.** Before that they see "waiting for review", with no content.

## Visit notes
- Doctors write and edit notes for a visit. Every edit keeps the previous version.
- Each version has the doctor's clinical notes and a separate short summary for the patient. The patient only ever sees the summary, once the visit is completed. The clinical notes are never shown to the patient.

## AI features
The AI is a helper, never a decision-maker, and the rest of the system must work with the AI turned off.

- **Admin chatbot:** answers only from the approved hospital-information knowledge base, and always shows its sources. It says "I don't have that information" rather than guessing. It refuses medical questions and requests for patient data.
- **Symptom checker:** suggests a department. Urgent symptoms are caught by a fixed list first and the patient is told to get help now, without asking the AI. If the AI is unsure, it says so.
- **Result explanations:** the AI drafts a plain-language explanation. A doctor must approve it before the patient sees it. Every number and unit must match the original result.
- **Wait-time estimate:** uses a learned model only if it beats the simple estimate (people ahead × average visit length) by at least 10%. Otherwise it uses the simple estimate.
- Nothing that identifies a patient (name, phone, ID) is ever sent to the AI.

## Always
- Arabic and English everywhere, right-to-left layout for Arabic.
- Times are stored in UTC and shown in Africa/Cairo time.
- Only fake data. Never real patient data: not in seeds, tests, prompts or logs.
- Demo databases have fixed demo logins (one per staff role, plus a patient) that share one password; they're listed in the README. They exist only where the demo data was loaded on purpose, never on a normal start.
- The core system keeps working when the AI service is down.
- Every new endpoint checks both the role and the record owner.


