import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.tsx'
import { session } from '../../lib/api.ts'
import { Providers } from '../../Providers.tsx'
import { appointment, clinic, fakeGateway, NOW, receptionist } from '../../test-fixtures.ts'
import { setLanguage } from '../../translations/i18n.ts'

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Providers queryClient={queryClient}>
        <App />
      </Providers>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Element.prototype.scrollIntoView = vi.fn()
  session.token = 'receptionist-token'
})

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  await setLanguage('en')
})

describe('Receptionist: today page', () => {
  it("shows the clinic's day with the now line and checks a patient in", async () => {
    const mona = appointment('10:30', 'Mona Adel')
    const day = [appointment('09:00', 'Omar Nabil', 'COMPLETED'), appointment('10:00', 'Karim Fathy', 'CHECKED_IN'), mona]
    let checkedIn = false
    const calls = fakeGateway({
      'GET /auth/me': () => ({ body: receptionist }),
      'GET /me/clinics': () => ({ body: [clinic] }),
      'GET /clinics/clinic-3/appointments': () => ({
        body: day.map((a) => (a.id === mona.id && checkedIn ? { ...a, status: 'CHECKED_IN' } : a)),
      }),
      'GET /clinics/clinic-3/queue': () => ({
        body: {
          clinicId: clinic.id,
          inConsultation: [],
          waiting: [{ appointmentId: day[1].id, patientName: 'Karim Fathy', doctorId: 'doctor-1', doctorName: 'Dr. Rania Mostafa', checkedInAt: '2026-11-06T07:55:00Z' }],
        },
      }),
      [`POST /appointments/${mona.id}/check-in`]: () => {
        checkedIn = true
        return { body: { ...mona, status: 'CHECKED_IN' } }
      },
    })

    renderAt('/reception')

    expect(await screen.findByRole('heading', { name: "Today's appointments" })).toBeInTheDocument()
    expect(await screen.findByText('Mona Adel')).toBeInTheDocument()
    // The now line sits at 10:24, between Karim (10:00) and Mona (10:30).
    const nowLine = screen.getByTestId('now-line')
    expect(nowLine).toHaveAccessibleName('Now, 10:24')
    expect(within(screen.getByRole('list', { name: 'Appointments by hour' })).getByText('Karim Fathy').compareDocumentPosition(nowLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Only the booked patient gets a Check in button.
    expect(screen.getAllByRole('button', { name: /^Check in/ })).toHaveLength(1)
    // The queue panel lists who is waiting.
    const queue = screen.getByRole('complementary')
    expect(within(queue).getByText('Karim Fathy')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Check in Mona Adel' }))

    expect(await screen.findByText('Mona Adel is checked in.')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST' && c.path === `/appointments/${mona.id}/check-in`)).toBe(true)
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /^Check in/ })).toHaveLength(0))
  })

  it('explains a refused check-in instead of failing silently', async () => {
    const mona = appointment('10:30', 'Mona Adel')
    fakeGateway({
      'GET /auth/me': () => ({ body: receptionist }),
      'GET /me/clinics': () => ({ body: [clinic] }),
      'GET /clinics/clinic-3/appointments': () => ({ body: [mona] }),
      'GET /clinics/clinic-3/queue': () => ({ body: { clinicId: clinic.id, waiting: [], inConsultation: [] } }),
      [`POST /appointments/${mona.id}/check-in`]: () => ({
        status: 409,
        body: { error: { code: 'INVALID_TRANSITION', message: 'Not booked' } },
      }),
    })

    renderAt('/reception')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Check in Mona Adel' }))

    expect(await screen.findByText(/That step isn't possible any more/)).toBeInTheDocument()
  })

  it('tells a receptionist with no clinic what to do', async () => {
    fakeGateway({
      'GET /auth/me': () => ({ body: receptionist }),
      'GET /me/clinics': () => ({ body: [] }),
    })

    renderAt('/reception')

    expect(await screen.findByText(/You aren't assigned to a clinic yet/)).toBeInTheDocument()
  })

  it('works in Arabic, right to left', async () => {
    await setLanguage('ar')
    fakeGateway({
      'GET /auth/me': () => ({ body: receptionist }),
      'GET /me/clinics': () => ({ body: [clinic] }),
      'GET /clinics/clinic-3/appointments': () => ({ body: [appointment('10:30', 'منى عادل')] }),
      'GET /clinics/clinic-3/queue': () => ({ body: { clinicId: clinic.id, waiting: [], inConsultation: [] } }),
    })

    renderAt('/reception')

    expect(await screen.findByRole('heading', { name: 'مواعيد اليوم' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'تسجيل حضور منى عادل' })).toBeInTheDocument()
    expect(document.documentElement.dir).toBe('rtl')
  })

  it('sends a signed-out visitor to the login page', async () => {
    session.token = null
    fakeGateway({})

    renderAt('/reception')

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })
})
