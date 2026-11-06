import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// With every file running in parallel, a file's first render (cold MUI imports)
// can take over a second on a busy machine or CI runner; wait up to 5 s for it.
configure({ asyncUtilTimeout: 5000 })

// Each test starts signed out, in English, with empty storage.
afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
})
