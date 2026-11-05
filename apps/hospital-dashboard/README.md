# Hospital dashboard

The staff website (React + Vite): one app with a view per role, in Arabic and English. This README also covers the app's own files in this folder and in `src/`.

**Rule:** Talks to the backend only through `src/lib/`. Permissions are enforced by the backend, not the UI.

## Files

- `package.json`: dependencies and scripts (`dev`, `build`, `lint`, `test`).
- `index.html`: the page Vite serves; loads `src/main.tsx`.
- `vite.config.ts`: Vite and Vitest settings (tests run in jsdom).
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`: TypeScript settings for the app code and for the Vite config.
- `.oxlintrc.json`: lint rules.
- `public/favicon.svg`: the browser tab icon.
- `src/main.tsx`: mounts the app.
- `src/App.tsx`: placeholder shell until the role pages arrive (KAN-17).
- `src/App.test.tsx`: smoke test for `App.tsx`.
- `src/index.css`: global styles.
