# Screens after login

The logged-in screens, shown as the bottom tabs.

## Files

- `_layout.tsx`: bottom-tab navigator for logged-in patients; redirects to `/(auth)/login` when there is no session.
- `book.tsx`: browse clinical departments → doctors → free slots, book a slot, view upcoming and past appointments, switch between Arabic (RTL) and English, and log out.

Still to come: queue and journey (KAN-15), results (KAN-16), profile (KAN-29).

