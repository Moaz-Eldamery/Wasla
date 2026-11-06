# Receptionist pages

Screens for receptionists: today's appointments, check-in and the queue board; later doctor schedules and walk-ins.

**Rule:** No medical details on any receptionist screen.

## Files

- `TodayPage.tsx`: `/reception` (KAN-17). It shows:
  - the clinic picker (remembered per browser)
  - today's appointments on the day book, with one-click **Check in** on booked patients
  - the clinic's queue beside it

  Both panels refresh every 15 seconds and on demand until live updates (KAN-27) exist.
- `TodayPage.test.tsx`: the whole page against a fake gateway:
  - the now line, check-in, a refused check-in, no clinic, Arabic, and signed out
