# Translations (dashboard)

All text the dashboard shows, in English and Arabic.

**Rule:** No hard-coded text in pages. Every key must exist in both files (`translations.test.ts` checks it).

## Files

- `en.json`, `ar.json`: the strings, grouped by screen. `errors.<ErrorCode>` gives the message for each contract error code.
- `i18n.ts`: i18next setup. It opens in English unless this browser chose Arabic before, and switching sets `<html lang dir>`. It also exports `localized()` for the API's `{ ar, en }` text and `errorMessage()` for anything thrown.
- `translations.test.ts`: key parity, no empty strings, and the right-to-left switch.
