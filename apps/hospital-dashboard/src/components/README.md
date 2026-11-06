# Components (dashboard)

UI pieces shared by more than one role's screens.

**Rule:** No backend calls here. Pages fetch through `src/lib/` and pass data in.

## Files

- `AppShell.tsx`: the frame around every staff screen. The blue top bar holds:
  - the clinic control (from the page) and today's date
  - the language switch
  - the account menu: a role switcher when the user has several screens, and log out
- `DayBook.tsx`: the day as a timetable. Hour labels run down the start edge, each appointment is a row in its hour, and a red "now" line sits at the current Cairo time. The page passes the action at the end of each row.
- `dayLayout.ts`: the day book's pure layout:
  - **Hour bands:** clinic hours are always shown, and empty hours are kept.
  - **Now line:** where it goes.
  - **Late mark:** a booked patient more than 10 minutes past their time.
  - Test: `dayLayout.test.ts`.
- `QueuePanel.tsx`: who is with the doctor, then the numbered waiting list, with loading, error and empty states.
- `StatusChip.tsx`: an appointment's status in its own colour. "Late" is red.
- `UpdatedAt.tsx`: when a panel last heard from the server, plus a refresh button.
