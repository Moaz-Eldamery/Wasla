# Translations (patient app)

All text the app shows, in Arabic and English.

**Rule:** No hard-coded text in screens. Every key must exist in both files.

## Files

- `ar.json`: Arabic strings for every screen, status and error code.
- `en.json`: English strings for every screen, status and error code.
- `i18n.ts`: `i18next` setup, Arabic/English language switcher with right-to-left (`I18nManager`) support, `pickLocalized` for `{ ar, en }` backend fields, `formatCairoDateTime`, `getCairoDayKey` and `formatCairoShortDay` (`Africa/Cairo`), and `translateErrorCode`.

