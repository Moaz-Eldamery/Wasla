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

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/Work email/), email)
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
    const calls = fakeGateway({
      'POST /auth/staff/login': () => ({ body: { token: 'tok', expiresAt: '2026-11-07T00:00:00Z', user: receptionist } }),
      'GET /me/clinics': () => ({ body: [clinic] }),
      'GET /clinics/clinic-3/appointments': () => ({ body: [] }),
      'GET /clinics/clinic-3/queue': () => ({ body: { clinicId: clinic.id, waiting: [], inConsultation: [] } }),
    })
    renderLogin()

    await fillAndSubmit(' Nadia.Hassan@hospital.test ', 'Passw0rd!')

    expect(await screen.findByRole('heading', { name: "Today's appointments" })).toBeInTheDocument()
    expect(session.token).toBe('tok')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      email: 'Nadia.Hassan@hospital.test',
      password: 'Passw0rd!',
    })
  })

  it('says when the email and password do not match', async () => {
    fakeGateway({
      'POST /auth/staff/login': () => ({ status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Wrong' } } }),
    })
    renderLogin()

    await fillAndSubmit('nadia.hassan@hospital.test', 'wrong-password')

    expect(await screen.findByText(/don't match an active staff account/)).toBeInTheDocument()
    expect(session.token).toBeNull()
  })

  it('tells patients to use the app', () => {
    renderLogin()

    expect(screen.getByText(/Patients use the Wasla app/)).toBeInTheDocument()
  })
})
