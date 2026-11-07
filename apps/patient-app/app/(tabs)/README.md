# Screens after login

The logged-in screens, shown as the bottom tabs. Each one starts with the shared `ScreenHeader` (title, language switch, logout) from `components/`.

## Files

- `_layout.tsx`: bottom-tab navigator for logged-in patients (`book`, `visit`, `results`, `assistant`, each with an icon); redirects to `/(auth)/login` when there is no session.
- `book.tsx`: the booking form: four `Dropdown`s (Department → Doctor → Day → Time), each disabled until the one above is chosen and picked for the patient when it has only one option, then one Book button. After booking it links to My Visit; when the time was just taken it says so and reloads the free times.
- `visit.tsx`: My Visit. Lists upcoming visits plus today's completed visits that still have a lab step (a visit `Dropdown` when there are several) and shows the chosen one as five steps (`VisitSteps`) with what to do, where to go and, once checked in, the people ahead (`GET /appointments/{appointmentId}/journey`, `/queue-position`, `GET /me/results` to know whether tests were ordered). While the visit is active and the screen is open it refreshes every 30 seconds; pull-to-refresh reloads everything.
- `results.tsx`: lists the patient's ordered test results (`GET /me/results`; unreleased ones show "Waiting for review", released ones are downloaded via `GET /tests/{testId}/result/file`, then opened in the phone's viewer or shared as the file) and every past visit (`GET /me/appointments?when=past`, picked with a `Dropdown`), with the doctor's patient-facing summary for a completed one (`GET /appointments/{appointmentId}/summary`).
- `assistant.tsx`: placeholder for the patient's AI assistant (symptom checker): a chat layout with one greeting, the input and send button disabled, and an "Emergency? Call 123" banner that opens the phone dialer. Sends nothing anywhere.

Every screen pads its top by the device's safe-area inset (`react-native-safe-area-context`), so content clears the notch and status bar. All of them work in Arabic (RTL) and English.

Still to come: profile (KAN-29).
