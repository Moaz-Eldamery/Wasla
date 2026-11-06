# Screens after login

The logged-in screens, shown as the bottom tabs.

## Files

- `_layout.tsx`: bottom-tab navigator for logged-in patients (`book`, `queue`, `journey`); redirects to `/(auth)/login` when there is no session.
- `book.tsx`: browse clinical departments → doctors → free slots, book a slot, view upcoming and past appointments, switch between Arabic (RTL) and English, and log out.
- `queue.tsx`: shows how many people are ahead of the patient in their doctor's line (`GET /appointments/{appointmentId}/queue-position`), with pull-to-refresh and manual refresh in Arabic (RTL) and English.
- `journey.tsx`: shows the patient's current visit stage, what to do next, and where to go (`GET /appointments/{appointmentId}/journey`), with pull-to-refresh and manual refresh in Arabic (RTL) and English.

Still to come: results (KAN-16), profile (KAN-29).

