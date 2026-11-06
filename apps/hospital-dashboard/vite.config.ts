import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The website calls /api/... on its own origin; the dev server forwards it to
// the gateway, dropping the /api prefix, so the browser never makes a
// cross-origin request. Point it at the mock with
//   VITE_PROXY_TARGET=http://localhost:4010 pnpm dev
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
