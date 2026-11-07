# Screens after login

The logged-in screens, shown as the bottom tabs.

## Files

- `_layout.tsx`: bottom-tab navigator for logged-in patients (`book`, `queue`, `journey`, `results`, each with an icon); redirects to `/(auth)/login` when there is no session.
- `book.tsx`: browse clinical departments → doctors → free slots (filtered by day when they span several days; falls back to all days once the chosen day has none left), book a slot, view upcoming and past appointments, switch between Arabic (RTL) and English, and log out.
- `queue.tsx`: shows how many people are ahead of the patient in their doctor's line (`GET /appointments/{appointmentId}/queue-position`), with pull-to-refresh and manual refresh in Arabic (RTL) and English.
- `journey.tsx`: shows the patient's current visit stage, what to do next, and where to go (`GET /appointments/{appointmentId}/journey`), with pull-to-refresh and manual refresh in Arabic (RTL) and English.
- `results.tsx`: lists the patient's ordered test results (`GET /me/results`; unreleased ones show "Waiting for review", released ones are downloaded via `GET /tests/{testId}/result/file`, then opened in the phone's viewer or shared as the file) and shows the doctor's patient-facing visit summary for a chosen completed visit (`GET /appointments/{appointmentId}/summary`), in Arabic (RTL) and English.

Every screen pads its top by the device's safe-area inset (`react-native-safe-area-context`), so content clears the notch and status bar.

Still to come: profile (KAN-29).

