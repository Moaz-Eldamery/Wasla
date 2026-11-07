import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.tsx'
import { session, type Appointment, type TestOrder, type User } from '../../lib/api.ts'
import { Providers } from '../../Providers.tsx'
import { appointment, clinic, fakeGateway, NOW } from '../../test-fixtures.ts'
import { setLanguage } from '../../translations/i18n.ts'

const doctor: User = { id: 'doctor-1', type: 'STAFF', name: 'Dr. Rania Mostafa', phone: null, email: 'doctor@hospital.test', roles: ['DOCTOR'] }
const labClinic = { ...clinic, id: 'lab-1', departmentId: 'lab', name: { en: 'Main Lab', ar: 'المختبر الرئيسي' } }
const departments = [{ id: 'lab', kind: 'LAB', name: { en: 'Laboratory', ar: 'المختبر' }, clinics: [labClinic] }]

function renderDoctor() {
  render(
    <MemoryRouter initialEntries={['/doctor']}>
      <Providers queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </Providers>
    </MemoryRouter>,
  )
}

/** A fake gateway for a doctor whose day is `day`; `routes` adds or overrides endpoints. */
function doctorGateway(day: Appointment[], routes: Parameters<typeof fakeGateway>[0] = {}) {
  const noNotes = () => ({ status: 404, body: { error: { code: 'NOT_FOUND', message: 'No notes yet' } } })
  return fakeGateway({
    'GET /auth/me': () => ({ body: doctor }),
    'GET /me/clinics': () => ({ body: [clinic] }),
    'GET /doctors/me/appointments': () => ({ body: day }),
    'GET /clinics/clinic-3/queue': () => ({ body: { clinicId: clinic.id, inConsultation: [], waiting: [] } }),
    'GET /departments': () => ({ body: departments }),
    ...Object.fromEntries(day.flatMap((a) => [[`GET /appointments/${a.id}/notes`, noNotes], [`GET /appointments/${a.id}/tests`, () => ({ body: [] })]])),
    ...routes,
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Element.prototype.scrollIntoView = vi.fn()
  session.token = 'doctor-token'
})

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  await setLanguage('en')
})

describe('Doctor: my patients today', () => {
  it('calls the next patient', async () => {
    const karim = appointment('10:30', 'Karim Fathy', 'CHECKED_IN')
    let called = false
    const calls = doctorGateway([karim], {
      'GET /doctors/me/appointments': () => ({ body: [{ ...karim, status: called ? 'IN_CONSULTATION' : 'CHECKED_IN' }] }),
      'POST /doctors/me/queue/call-next': () => {
        called = true
        return { body: { ...karim, status: 'IN_CONSULTATION' } }
      },
    })
    renderDoctor()

    await userEvent.setup().click(await screen.findByRole('button', { name: /Call next patient/ }))

    expect(await screen.findByText('Karim Fathy is with you now.')).toBeInTheDocument()
    const body = calls.find((c) => c.path === '/doctors/me/queue/call-next')!.init.body
    expect(JSON.parse(String(body))).toEqual({ clinicId: clinic.id })
    // The visit panel opens on the patient, and Call next waits until this visit is finished.
    const panel = await screen.findByRole('complementary', { name: 'Visit' })
    expect(within(panel).getByRole('heading', { name: 'Karim Fathy' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /Call next patient/ })).toBeDisabled())
  })

  it('saves the first version of the notes', async () => {
    const mona = appointment('10:00', 'Mona Adel', 'IN_CONSULTATION')
    const v1 = { appointmentId: mona.id, version: 1, clinicalNotes: 'BP 120/80', patientSummary: null, authorName: doctor.name, createdAt: NOW.toISOString() }
    let saved = false
    const saveCalls = doctorGateway([mona], {
      [`GET /appointments/${mona.id}/notes`]: () => (saved ? { body: v1 } : { status: 404, body: { error: { code: 'NOT_FOUND', message: '' } } }),
      [`PUT /appointments/${mona.id}/notes`]: () => {
        saved = true
        return { body: v1 }
      },
    })
    renderDoctor()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText(/Clinical notes/), 'BP 120/80')
    await user.click(screen.getByRole('button', { name: 'Save notes' }))

    expect(await screen.findByText('Notes saved (version 1).')).toBeInTheDocument()
    const put = saveCalls.find((c) => c.method === 'PUT')!
    expect(JSON.parse(String(put.init.body))).toEqual({ baseVersion: 0, clinicalNotes: 'BP 120/80', patientSummary: null })
  })

  it('keeps the draft and loads the newer version when someone else saved first', async () => {
    const mona = appointment('10:00', 'Mona Adel', 'IN_CONSULTATION')
    const theirs = { appointmentId: mona.id, version: 2, clinicalNotes: 'Their notes', patientSummary: null, authorName: 'Dr. Other', createdAt: NOW.toISOString() }
    let conflicted = false
    doctorGateway([mona], {
      [`GET /appointments/${mona.id}/notes`]: () =>
        conflicted ? { body: theirs } : { body: { ...theirs, version: 1, clinicalNotes: 'Old', authorName: doctor.name } },
      [`PUT /appointments/${mona.id}/notes`]: () => {
        conflicted = true
        return { status: 409, body: { error: { code: 'VERSION_CONFLICT', message: 'Newer version' } } }
      },
    })
    renderDoctor()
    const user = userEvent.setup()

    const field = await screen.findByLabelText(/Clinical notes/)
    await user.clear(field)
    await user.type(field, 'My notes')
    await user.click(screen.getByRole('button', { name: 'Save notes' }))

    expect(await screen.findByText(/Someone saved these notes after you opened them/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Clinical notes/)).toHaveValue('My notes')
    expect(screen.getByText('Their notes')).toBeInTheDocument()
  })

  it('orders a lab test during the visit', async () => {
    const mona = appointment('10:00', 'Mona Adel', 'IN_CONSULTATION')
    const ordered: TestOrder = {
      id: 't1', appointmentId: mona.id, patientName: mona.patient.name, testName: 'Complete blood count', clinic: labClinic,
      status: 'REQUESTED', orderedByName: doctor.name, orderedAt: NOW.toISOString(),
    }
    const orderCalls = doctorGateway([mona], {
      [`POST /appointments/${mona.id}/tests`]: () => ({ status: 201, body: ordered }),
    })
    renderDoctor()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('tab', { name: 'Tests and results' }))
    await user.click(await screen.findByLabelText(/Lab or radiology clinic/))
    await user.click(await screen.findByRole('option', { name: 'Laboratory · Main Lab' }))
    await user.type(screen.getByLabelText(/^Test/), 'Complete blood count')
    await user.click(screen.getByRole('button', { name: 'Order test' }))

    expect(await screen.findByText('Complete blood count ordered.')).toBeInTheDocument()
    const post = orderCalls.find((c) => c.method === 'POST' && c.path.endsWith('/tests'))!
    expect(JSON.parse(String(post.init.body))).toEqual({ clinicId: 'lab-1', testName: 'Complete blood count', instructions: null })
  })

  it('releases a result after confirming', async () => {
    const mona = appointment('09:30', 'Mona Adel', 'COMPLETED')
    let released = false
    const test: TestOrder = {
      id: 't9', appointmentId: mona.id, patientName: mona.patient.name, testName: 'Chest X-ray', clinic: labClinic,
      status: 'AWAITING_REVIEW', orderedByName: doctor.name, orderedAt: NOW.toISOString(),
      file: { fileName: 'xray.pdf', contentType: 'application/pdf', sizeBytes: 240_000, uploadedAt: NOW.toISOString() },
    }
    const calls = doctorGateway([mona], {
      [`GET /appointments/${mona.id}/tests`]: () => ({ body: [{ ...test, status: released ? 'RELEASED' : 'AWAITING_REVIEW' }] }),
      'POST /tests/t9/release': () => {
        released = true
        return { body: { ...test, status: 'RELEASED' } }
      },
    })
    renderDoctor()
    const user = userEvent.setup()

    // A finished visit opens from the day book.
    await user.click(await screen.findByRole('button', { name: 'Open the visit for Mona Adel' }))
    await user.click(await screen.findByRole('tab', { name: 'Tests and results' }))
    expect(await screen.findByText('Ready to review')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Release to patient' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Mona Adel will be able to see and download Chest X-ray/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Release' }))

    expect(await screen.findByText('Chest X-ray released to the patient.')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST' && c.path === '/tests/t9/release')).toBe(true)
    expect(await screen.findByText('Released')).toBeInTheDocument()
  })

  it('warns before finishing a visit with no notes', async () => {
    const mona = appointment('10:00', 'Mona Adel', 'IN_CONSULTATION')
    const finishCalls = doctorGateway([mona], {
      [`POST /appointments/${mona.id}/complete`]: () => ({ body: { ...mona, status: 'COMPLETED' } }),
    })
    renderDoctor()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Finish visit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Finish without notes?' })
    expect(finishCalls.some((c) => c.path.endsWith('/complete'))).toBe(false)
    await user.click(within(dialog).getByRole('button', { name: 'Finish anyway' }))

    expect(await screen.findByText('Visit with Mona Adel finished.')).toBeInTheDocument()
    expect(finishCalls.some((c) => c.method === 'POST' && c.path === `/appointments/${mona.id}/complete`)).toBe(true)
  })
})
