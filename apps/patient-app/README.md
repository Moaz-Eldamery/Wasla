# Patient app

The patient mobile app (React Native + Expo, expo-router), in Arabic and English. This README also covers the app's own files in this folder and in `app/`.

**Rule:** Talks to the backend only through `lib/`. No test files in `app/`: expo-router would turn them into screens.

## Files

- `package.json`: dependencies (including `expo-file-system` and `expo-sharing` for result files) and scripts (`start`, `android`, `ios`, `web`, `generate:api-types`, `lint`, `test`). `main` points at expo-router.
- `app.json`: Expo settings: name, icons, the `wasla://` link scheme, the expo-router plugin.
- `tsconfig.json`: TypeScript settings (extends Expo's).
- `app.test.tsx`: tests for the patient app (sign-up, verification code, login, logout, booking with the four dropdowns (auto-picked single options, a fully booked day, a time someone else took), My Visit (stage-to-step mapping, people ahead, the 30-second refresh, the lab step of a completed visit, the return trip to the doctor, no visits), the assistant placeholder, test results (open, share, deleted at logout, refused downloads), past visits and their summaries (not ready yet, switching visits, cancelled visits), and Arabic/English translations). Mocks `expo-sharing`, the safe-area insets and expo-router (including `useFocusEffect`); My Visit tests answer requests by path.
- `components/`: UI pieces several screens share (see its README).
- `assets/`: app icons and splash image.
- `app/_layout.tsx`: the root layout (a stack navigator) around every screen, re-rendering when the language changes.
- `app/index.tsx`: redirects to `/(tabs)/book` when logged in or `/(auth)/login` when logged out.

