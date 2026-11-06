import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.tsx'
import { session } from '../../lib/api.ts'
import { Providers } from '../../Providers.tsx'
import { adminDepartments, adminUser, fakeGateway, staffList } from '../../test-fixtures.ts'

function renderHospital(path = '/admin/hospital') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Providers queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </Providers>
    </MemoryRouter>,
  )
}

type Routes = Parameters<typeof fakeGateway>[0]
function hospitalGateway(extra: Routes = {}) {
  return fakeGateway({
    'GET /auth/me': () => ({ body: adminUser }),
    'GET /admin/departments': () => ({ body: adminDepartments() }),
    'GET /auth/staff': () => ({ body: staffList.filter((p) => p.active) }),
    ...extra,
  })
}

const body = (init: RequestInit) => JSON.parse(String(init.body))
const clinic = adminDepartments()[0].clinics[0]

beforeEach(() => {
  session.token = 'admin-token'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Departments, clinics and assignments', () => {
  it('shows the first department with its clinics, location and staff', async () => {
    hospitalGateway()
    renderHospital()

    expect(await screen.findByRole('heading', { level: 2, name: 'Internal Medicine' })).toBeInTheDocument()
    const row = screen.getByRole('listitem', { name: 'Internal Medicine Clinic 1' })
    expect(within(row).getByText(/Building A · Floor 1 · First floor, left of the lift/)).toBeInTheDocument()
    const staff = within(row).getByRole('list', { name: 'Staff in Internal Medicine Clinic 1' })
    expect(within(staff).getByText('Dr. Rania Mostafa')).toBeInTheDocument()
    expect(within(staff).getByText('Nadia Hassan')).toBeInTheDocument()
  })

  it('marks an inactive department as not bookable, keeping past appointments', async () => {
    hospitalGateway()
    renderHospital()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Dermatology/ }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Dermatology' })).toBeInTheDocument()
    expect(screen.getByText(/patients can't book it or any of its clinics\. Booked and past appointments still show it/)).toBeInTheDocument()
    expect(screen.getByText('Not bookable while the department is inactive')).toBeInTheDocument()
  })

  it('adds a department with its English and Arabic names', async () => {
    const calls = hospitalGateway({
      'POST /admin/departments': (_, init) => ({ status: 201, body: { id: 'dep-new', ...body(init), active: true, clinics: [] } }),
    })
    renderHospital()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add department' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a department' })
    await user.click(within(dialog).getByRole('button', { name: 'Add department' }))
    expect(within(dialog).getAllByText('Required.')).toHaveLength(2)

    await user.type(within(dialog).getByRole('textbox', { name: 'Name (English)' }), 'Ophthalmology')
    await user.type(within(dialog).getByRole('textbox', { name: 'Name (Arabic)' }), 'الرمد')
    await user.click(within(dialog).getByRole('button', { name: 'Add department' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(body(calls.find((c) => c.method === 'POST')!.init)).toEqual({ kind: 'CLINICAL', name: { en: 'Ophthalmology', ar: 'الرمد' } })
  })

  it('edits a clinic’s building, floor and directions', async () => {
    const calls = hospitalGateway({ [`PUT /admin/clinics/${clinic.id}`]: (_, init) => ({ body: { ...clinic, ...body(init) } }) })
    renderHospital()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Edit Internal Medicine Clinic 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit clinic' })
    const floor = within(dialog).getByRole('textbox', { name: 'Floor' })
    await user.clear(floor)
    await user.type(floor, '2')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(body(calls.find((c) => c.method === 'PUT')!.init)).toEqual({
      name: clinic.name,
      building: 'A',
      floor: '2',
      directions: clinic.directions,
    })
  })

  it('assigns a doctor to a clinic, offering only clinic staff who aren’t there yet', async () => {
    const calls = hospitalGateway({ [`PUT /admin/clinics/${clinic.id}/staff/lab-1`]: () => ({ body: clinic }) })
    renderHospital()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Assign staff to Internal Medicine Clinic 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Assign staff to Internal Medicine Clinic 1' })
    await user.click(within(dialog).getByRole('combobox', { name: 'Staff member' }))
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options.join('|')).toContain('Mona Farouk')
    expect(options.join('|')).not.toContain('Demo Admin')
    expect(options.join('|')).not.toContain('Dr. Rania Mostafa')

    await user.click(screen.getByRole('option', { name: /Mona Farouk/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.path === `/admin/clinics/${clinic.id}/staff/lab-1`)).toBe(true))
  })

  it('removes someone from a clinic after confirming', async () => {
    const calls = hospitalGateway({ [`DELETE /admin/clinics/${clinic.id}/staff/doc-1`]: () => ({ body: clinic }) })
    renderHospital()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Remove Dr. Rania Mostafa' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove Dr. Rania Mostafa from Internal Medicine Clinic 1?' })
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
  })

  it('deactivates a clinic only after saying it won’t be bookable but keeps past appointments', async () => {
    const calls = hospitalGateway({ [`POST /admin/clinics/${clinic.id}/deactivate`]: () => ({ body: { ...clinic, active: false } }) })
    renderHospital()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Deactivate Internal Medicine Clinic 1' }))
    const dialog = screen.getByRole('dialog', { name: 'Deactivate Internal Medicine Clinic 1?' })
    expect(within(dialog).getByText('It will no longer be bookable.')).toBeInTheDocument()
    expect(within(dialog).getByText(/Booked and past appointments keep it/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(calls.some((c) => c.path === `/admin/clinics/${clinic.id}/deactivate`)).toBe(true))
  })

  it('keeps the dialog open with the reason when the server refuses', async () => {
    hospitalGateway({ [`POST /admin/clinics/${clinic.id}/deactivate`]: () => ({ status: 403, body: { error: { code: 'FORBIDDEN', message: 'no' } } }) })
    renderHospital()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Deactivate Internal Medicine Clinic 1' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }))
    expect(await within(screen.getByRole('dialog')).findByText("Your account can't do that.")).toBeInTheDocument()
  })
})
