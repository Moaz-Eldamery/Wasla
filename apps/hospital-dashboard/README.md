# Hospital dashboard

The staff website (React + Vite, MUI, TanStack Query, i18next): one app with a screen per role, in English (default) and Arabic (right-to-left). This README also covers the app's own files in this folder and in `src/`.

**Rule:** Talks to the backend only through `src/lib/`. Permissions are enforced by the backend, not the UI. Design direction: `PRODUCT.md` in the repo root.

## Run it

```sh
pnpm --filter @wasla/hospital-dashboard dev                                          # against the gateway on :8080
VITE_PROXY_TARGET=http://localhost:4010 pnpm --filter @wasla/hospital-dashboard dev  # against `pnpm mock`
```

The site calls `/api/...` on its own origin, and the dev server forwards those calls to the gateway without the `/api` prefix, so the browser never makes a cross-origin call.

## Files

- `package.json`: dependencies and scripts (`dev`, `build`, `lint`, `test`, `generate:api-types`). `lint` also fails when `src/lib/api-types.ts` is out of date with the contract.
- `index.html`: the page Vite serves; loads `src/main.tsx`.
- `vite.config.ts`: the `/api` proxy (`VITE_PROXY_TARGET`, default `http://localhost:8080`) and the Vitest settings (jsdom, `src/test-setup.ts`).
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`: TypeScript 6 settings for the app code and for the Vite config. TypeScript 7 can't run `openapi-typescript`.
- `.oxlintrc.json`: lint rules.
- `public/favicon.svg`: the browser tab icon.
- `src/main.tsx`: loads the font, the styles and the translations, then mounts the app.
- `src/Providers.tsx`: theme, the style cache for left-to-right or right-to-left, the TanStack Query client and the session, around the whole app.
- `src/App.tsx`: the routes. `/login`, `/reception` (receptionists), `/doctor` (doctors), `/lab` (lab and radiology staff), `/admin` (admins: the assistant), and `/`, which sends staff to their first role's screen.
- `src/LoginPage.tsx`: staff login with phone and password. Patient accounts are turned away. The blue panel shows `src/assets/login-doctor.webp`, blurred under a blue wash. Test: `LoginPage.test.tsx`.
- `src/assets/`: images bundled by Vite. `login-doctor.webp` is the login photo, supplied by Moaz and re-encoded from PNG to WebP (63 kB).
- `src/session.tsx`: who is signed in. It restores the user after a reload (`GET /auth/me`) and returns to login when the gateway answers 401. Logging out also clears the assistant conversation kept in the tab.
- `src/roles.ts`: which roles have a screen, and where each role lands after login.
- `src/theme.ts`: Wasla's palette (shared with the patient app), the status colours, the type scale and the MUI theme.
- `src/time.ts`: time helpers and `REFRESH_MS` (15 s polling until live updates). Everything is shown in Africa/Cairo time, and `cairoDate()` gives the API's `date` parameter.
- `src/useNow.ts`: the current time, ticking every 30 seconds.
- `src/index.css`: browser surfaces MUI doesn't draw: selection, focus ring, scrollbars and tabular numerals.
- `src/test-setup.ts`: Vitest setup (jest-dom matchers, cleanup, storage reset).
- `src/test-fixtures.ts`: fake data and a fake gateway (`fakeGateway`) for tests. Every name is made up.
