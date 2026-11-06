import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Each test starts signed out, in English, with empty storage.
afterEach(() => {
  cleanup()
  sessionStorage.clear()
  localStorage.clear()
})
