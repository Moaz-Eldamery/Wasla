import { QueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { session } from './lib/api.ts'
import { Providers } from './Providers.tsx'
import { clinic, fakeGateway, receptionist } from './test-fixtures.ts'

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Providers queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </Providers>
    </MemoryRouter>,
  )
}

async function fillAndSubmit(phone: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/Phone number/), phone)
  await user.type(screen.getByLabelText(/Password/), password)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Login', () => {
  it('takes a receptionist to the reception screen', async () => {
    fakeGateway({
      'POST /auth/login': () => ({ body: { token: 'tok', expiresAt: '2026-11-07T00:00:00Z', user: receptionist } }),
      'GET /me/clinics': () => ({ body: [clinic] }),
      'GET /clinics/clinic-3/appointments': () => ({ body: [] }),
      'GET /clinics/clinic-3/queue': () => ({ body: { clinicId: clinic.id, waiting: [], inConsultation: [] } }),
    })
    renderLogin()

    await fillAndSubmit('+201000000010', 'Passw0rd!')

    expect(await screen.findByRole('heading', { name: "Today's appointments" })).toBeInTheDocument()
    expect(session.token).toBe('tok')
  })

  it('says when the phone and password do not match', async () => {
    fakeGateway({
      'POST /auth/login': () => ({ status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Wrong' } } }),
    })
    renderLogin()

    await fillAndSubmit('+201000000010', 'wrong-password')

    expect(await screen.findByText(/don't match an active account/)).toBeInTheDocument()
    expect(session.token).toBeNull()
  })

  it('turns patients away to the app', async () => {
    fakeGateway({
      'POST /auth/login': () => ({
        body: { token: 'patient-tok', expiresAt: '2026-11-07T00:00:00Z', user: { ...receptionist, type: 'PATIENT', roles: [] } },
      }),
      'POST /auth/logout': () => ({ status: 204 }),
    })
    renderLogin()

    await fillAndSubmit('+201000000006', 'Passw0rd!')

    expect(await screen.findByText(/Patients use the Wasla app/)).toBeInTheDocument()
    expect(session.token).toBeNull()
  })
})
