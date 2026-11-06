# Patient app

The patient mobile app (React Native + Expo, expo-router), in Arabic and English. This README also covers the app's own files in this folder and in `app/`.

**Rule:** Talks to the backend only through `lib/`. No test files in `app/`: expo-router would turn them into screens.

## Files

- `package.json`: dependencies and scripts (`start`, `android`, `ios`, `web`, `generate:api-types`, `lint`, `test`). `main` points at expo-router.
- `app.json`: Expo settings: name, icons, the `wasla://` link scheme, the expo-router plugin.
- `tsconfig.json`: TypeScript settings (extends Expo's).
- `app.test.tsx`: tests for the patient app (sign-up, verification code, login, logout, browsing and booking, appointments, queue position, visit journey, and Arabic/English translations).
- `assets/`: app icons and splash image.
- `app/_layout.tsx`: the root layout (a stack navigator) around every screen, re-rendering when the language changes.
- `app/index.tsx`: redirects to `/(tabs)/book` when logged in or `/(auth)/login` when logged out.

