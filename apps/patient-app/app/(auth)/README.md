# Screens before login

Screens a patient sees before logging in. Each file is one screen (expo-router). The brackets group the screens without adding to the route.

## Files

- `_layout.tsx`: stack navigator for the auth screens.
- `login.tsx`: phone and password login screen with language toggle and links to sign up or verify a phone number.
- `sign-up.tsx`: patient registration screen (name, Egyptian mobile number, password) that sends a simulated 6-digit SMS code.
- `verify-code.tsx`: 6-digit phone verification screen that shows the simulated SMS code in the prototype and supports resending a code.

