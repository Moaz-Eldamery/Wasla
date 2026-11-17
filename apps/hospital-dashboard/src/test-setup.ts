import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// With every file running in parallel, a file's first render (cold MUI imports)
// can take over a second on a busy machine or CI runner; wait up to 5 s for it.
configure({ asyncUtilTimeout: 5000 })

function createStorage() {
  const values = new Map<string, string>()
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, String(value)),
    get length() {
      return values.size
    },
  }
}

// Keep jsdom storage available through the Node test globals on Node versions
// without browser storage globals. Some tests call vi.unstubAllGlobals().
beforeEach(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: createStorage() })
  }
  if (!window.sessionStorage) {
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: createStorage() })
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: window.localStorage })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: window.sessionStorage })
})

// Each test starts signed out, in English, with empty storage.
afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  window.localStorage.clear()
})
