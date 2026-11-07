# Components (patient app)

UI pieces several screens share.

**Rule:** No backend calls except `ScreenHeader`'s logout (through `lib/api.ts`). No hard-coded text: every string comes from `translations/`. Each piece follows the right-to-left layout in Arabic.

## Files

- `Dropdown.tsx`: a form field that opens a bottom sheet listing its options (label plus an optional second line), with a check on the chosen one. Disabled, loading and empty states; the field's test ID is `testID`, each option's `${testID}-option-${value}`. Used by booking, My Visit and Results.
- `ScreenHeader.tsx`: the header on every tab: the screen title (and an optional subtitle), the language switch and logout.
- `VisitSteps.tsx`: the visit as five numbered steps (Booked → Checked in → See the doctor → Tests, only if ordered → Done), with the current step opened up to show the backend's "what to do" and "where to go" and the people ahead. `getVisitSteps` maps a journey stage onto the steps: after the lab the patient stays on step 4, so progress never moves backwards. Also holds `VISIT_REFRESH_MS` (30 s) and `isActiveStage`.
