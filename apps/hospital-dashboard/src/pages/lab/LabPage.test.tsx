import { QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.tsx'
import { session, type TestOrder, type TestStatus, type User } from '../../lib/api.ts'
import { Providers } from '../../Providers.tsx'
import { clinic, fakeGateway, NOW } from '../../test-fixtures.ts'
import { checkResultFile, formatBytes } from './resultFile.ts'

const labUser: User = { id: 'lab-1', type: 'STAFF', name: 'Salma Lab', phone: null, email: 'lab@hospital.test', roles: ['LAB'] }
const labClinic = { ...clinic, id: 'lab-c1', name: { en: 'Main Lab', ar: 'المختبر الرئيسي' } }

let n = 0
function test(name: string, patient: string, status: TestStatus, minutesAgo: number, extra: Partial<TestOrder> = {}): TestOrder {
  n += 1
  return {
    id: `t${n}`, appointmentId: `a${n}`, patientName: patient, testName: name, clinic: labClinic, status,
    orderedByName: 'Dr. Rania Mostafa', orderedAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(), ...extra,
  }
}

function labGateway(tests: TestOrder[], routes: Parameters<typeof fakeGateway>[0] = {}) {
  return fakeGateway({
    'GET /auth/me': () => ({ body: labUser }),
    'GET /me/clinics': () => ({ body: [labClinic] }),
    'GET /lab/tests': () => ({ body: tests }),
    ...routes,
  })
}

function renderLab() {
  render(
    <MemoryRouter initialEntries={['/lab']}>
      <Providers queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </Providers>
    </MemoryRouter>,
  )
}

const pdf = (size = 120_000, name = 'cbc.pdf', type = 'application/pdf') => {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  session.token = 'lab-token'
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('resultFile', () => {
  it('accepts PDF, JPEG and PNG up to 10 MB', () => {
    expect(checkResultFile(pdf())).toBeNull()
    expect(checkResultFile(pdf(2_000_000, 'scan.png', 'image/png'))).toBeNull()
    expect(checkResultFile(pdf(10 * 1024 * 1024 + 1))).toBe('lab.tooLarge')
    expect(checkResultFile(pdf(1000, 'notes.docx', 'application/msword'))).toBe('lab.wrongType')
  })

  it('formats sizes', () => {
    expect(formatBytes(182_000)).toBe('178 KB')
    expect(formatBytes(4_404_019)).toBe('4.2 MB')
  })
})

describe('Lab worklist', () => {
  it('splits tests into tabs with counts and shows how long each has waited', async () => {
    labGateway([
      test('Complete blood count', 'Mona Adel', 'REQUESTED', 75),
      test('Chest X-ray', 'Karim Fathy', 'REQUESTED', 12),
      test('Lipid profile', 'Hoda Samir', 'IN_PROGRESS', 30),
      test('Urine test', 'Omar Nabil', 'RELEASED', 200),
    ])
    renderLab()

    expect(await screen.findByRole('tab', { name: /To start\s*2/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /In progress\s*1/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Sent to doctor\s*0/ })).toBeInTheDocument()
    expect(screen.getByText('waiting 1 h 15 min, over an hour')).toBeInTheDocument()
    expect(screen.getByText('waiting 12 min')).toBeInTheDocument()
    expect(screen.queryByText('Urine test')).not.toBeInTheDocument()
  })

  it('starts a test', async () => {
    const cbc = test('Complete blood count', 'Mona Adel', 'REQUESTED', 20, { instructions: 'Fasting sample' })
    const calls = labGateway([cbc], { [`POST /tests/${cbc.id}/start`]: () => ({ body: { ...cbc, status: 'IN_PROGRESS' } }) })
    renderLab()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Complete blood count/ }))
    const panel = screen.getByRole('complementary')
    expect(within(panel).getByText('Fasting sample')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Start test' }))

    expect(await screen.findByText('Complete blood count for Mona Adel is in progress.')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST' && c.path === `/tests/${cbc.id}/start`)).toBe(true)
  })

  it('refuses a wrong or oversized file without sending anything', async () => {
    const cbc = test('Complete blood count', 'Mona Adel', 'IN_PROGRESS', 20)
    const calls = labGateway([cbc])
    renderLab()
    const user = userEvent.setup({ applyAccept: false })

    await user.click(await screen.findByRole('tab', { name: /In progress/ }))
    await user.click(screen.getByRole('button', { name: /Complete blood count/ }))
    const input = screen.getByLabelText('choose a file', { selector: 'input' })
    await user.upload(input, pdf(1000, 'notes.docx', 'application/msword'))
    expect(await screen.findByText(/notes.docx isn't a PDF, JPEG or PNG/)).toBeInTheDocument()
    await user.upload(input, pdf(12 * 1024 * 1024, 'big.pdf'))
    expect(await screen.findByText(/big.pdf is 12.0 MB. Results can be at most 10 MB/)).toBeInTheDocument()
    expect(calls.some((c) => c.path.endsWith('/result'))).toBe(false)
  })

  it('checks the chosen file, then sends it to the doctor', async () => {
    const cbc = test('Complete blood count', 'Mona Adel', 'IN_PROGRESS', 20)
    const calls = labGateway([cbc], {
      [`POST /tests/${cbc.id}/result`]: () => ({
        body: { ...cbc, status: 'AWAITING_REVIEW', file: { fileName: 'cbc.pdf', contentType: 'application/pdf', sizeBytes: 120_000, uploadedAt: NOW.toISOString() } },
      }),
    })
    renderLab()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('tab', { name: /In progress/ }))
    await user.click(screen.getByRole('button', { name: /Complete blood count/ }))
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [pdf()] } })

    expect(await screen.findByText("Check this is Mona Adel's Complete blood count before sending.")).toBeInTheDocument()
    expect(calls.some((c) => c.path.endsWith('/result'))).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Send to doctor' }))

    expect(await screen.findByText('Complete blood count for Mona Adel was sent to the doctor.')).toBeInTheDocument()
    const sent = calls.find((c) => c.method === 'POST' && c.path === `/tests/${cbc.id}/result`)!
    expect(sent.init.body).toBeInstanceOf(FormData)
    expect(((sent.init.body as FormData).get('file') as File).name).toBe('cbc.pdf')
    expect(new Headers(sent.init.headers).get('Content-Type')).toBeNull()
  })

  it('lets a sent file be replaced until the doctor releases it', async () => {
    const xray = test('Chest X-ray', 'Karim Fathy', 'AWAITING_REVIEW', 90, {
      file: { fileName: 'xray-old.png', contentType: 'image/png', sizeBytes: 900_000, uploadedAt: NOW.toISOString() },
    })
    labGateway([xray])
    renderLab()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('tab', { name: /Sent to doctor\s*1/ }))
    await user.click(screen.getByRole('button', { name: /Chest X-ray/ }))
    expect(screen.getByText('xray-old.png')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Replace file' }))

    expect(screen.getByTestId('dropzone')).toBeInTheDocument()
  })
})
