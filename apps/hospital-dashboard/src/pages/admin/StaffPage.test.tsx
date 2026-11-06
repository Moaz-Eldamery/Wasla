import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.tsx'
import { session } from '../../lib/api.ts'
import { Providers } from '../../Providers.tsx'
import { adminUser, fakeGateway, staffList } from '../../test-fixtures.ts'
import { normalizePhone } from './staff.ts'

function renderStaff() {
  return render(
    <MemoryRouter initialEntries={['/admin/staff']}>
      <Providers queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </Providers>
    </MemoryRouter>,
  )
}

type Routes = Parameters<typeof fakeGateway>[0]
function staffGateway(extra: Routes = {}) {
  return fakeGateway({
    'GET /auth/me': () => ({ body: adminUser }),
    'GET /auth/staff': () => ({ body: staffList }),
    'GET /admin/departments': () => ({ body: [] }),
    ...extra,
  })
}

const row = (name: string) => within(screen.getByRole('table')).getByText(name).closest('tr')!
const body = (init: RequestInit) => JSON.parse(String(init.body))
/** The query string of the latest staff-list request. */
function lastStaffQuery(): URLSearchParams {
  const urls = vi.mocked(fetch).mock.calls.map(([input]) => new URL(String(input), 'http://localhost')).filter((u) => u.pathname.endsWith('/auth/staff'))
  return urls.at(-1)!.searchParams
}

beforeEach(() => {
  session.token = 'admin-token'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Staff and roles', () => {
  it('lists staff with their roles and status, and searches by name or phone', async () => {
    staffGateway()
    renderStaff()
    const user = userEvent.setup()

    expect(await screen.findByText('Dr. Rania Mostafa')).toBeInTheDocument()
    expect(within(row('Mona Farouk')).getByText('Lab / radiology')).toBeInTheDocument()
    expect(within(row('Dr. Omar Nabil')).getAllByText('Inactive').length).toBeGreaterThan(0)
    expect(within(row('Demo Admin')).getByText('You')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Search staff' }), '0011')
    await waitFor(() => expect(lastStaffQuery().get('q')).toBe('0011'))

    await user.click(screen.getByRole('tab', { name: 'Inactive' }))
    await waitFor(() => expect(lastStaffQuery().get('status')).toBe('inactive'))
    expect(lastStaffQuery().get('q')).toBe('0011')
  })

  it('adds a staff member and shows the temporary password once', async () => {
    const calls = staffGateway({
      'POST /auth/staff': (_, init) => ({
        status: 201,
        body: { staff: { id: 'new-1', ...body(init), active: true, createdAt: '2026-11-06T10:30:00Z' }, temporaryPassword: 'river-amber-4729' },
      }),
    })
    renderStaff()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add staff member' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a staff member' })
    await user.click(within(dialog).getByRole('button', { name: 'Add and get password' }))
    expect(within(dialog).getByText('Choose at least one role.')).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'POST')).toBe(false)

    await user.type(within(dialog).getByRole('textbox', { name: 'Full name' }), 'Laila Mahmoud')
    await user.type(within(dialog).getByRole('textbox', { name: 'Mobile number' }), '010 1234 5678')
    await user.click(within(dialog).getByRole('checkbox', { name: /Receptionist/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Add and get password' }))

    const created = await screen.findByRole('dialog', { name: 'Laila Mahmoud can now log in' })
    expect(within(created).getByText('river-amber-4729')).toBeInTheDocument()
    expect(within(created).getByText(/only time the password is shown/)).toBeInTheDocument()
    expect(body(calls.find((c) => c.method === 'POST')!.init)).toEqual({ name: 'Laila Mahmoud', phone: '+201012345678', roles: ['RECEPTIONIST'] })

    await user.click(within(created).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByText('river-amber-4729')).not.toBeInTheDocument())
  })

  it('says when the phone number already has an account', async () => {
    staffGateway({ 'POST /auth/staff': () => ({ status: 409, body: { error: { code: 'PHONE_TAKEN', message: 'taken' } } }) })
    renderStaff()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add staff member' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: 'Full name' }), 'Laila Mahmoud')
    await user.type(within(dialog).getByRole('textbox', { name: 'Mobile number' }), '01000000021')
    await user.click(within(dialog).getByRole('checkbox', { name: /Doctor/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Add and get password' }))

    expect(await within(dialog).findByText('This phone number already has an account.')).toBeInTheDocument()
  })

  it('changes a staff member’s roles', async () => {
    const calls = staffGateway({ 'PUT /auth/staff/doc-1/roles': (_, init) => ({ body: { ...staffList[1], roles: body(init).roles } }) })
    renderStaff()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Change roles for Dr. Rania Mostafa' }))
    const dialog = screen.getByRole('dialog', { name: 'Roles for Dr. Rania Mostafa' })
    await user.click(within(dialog).getByRole('checkbox', { name: /Receptionist/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Save roles' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(body(calls.find((c) => c.method === 'PUT')!.init)).toEqual({ roles: ['RECEPTIONIST', 'DOCTOR'] })
  })

  it('confirms before deactivating, saying they will be logged out immediately', async () => {
    const calls = staffGateway({ 'POST /auth/staff/rec-1/deactivate': () => ({ body: { ...staffList[3], active: false } }) })
    renderStaff()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Deactivate Nadia Hassan' }))
    const dialog = screen.getByRole('dialog', { name: 'Deactivate Nadia Hassan?' })
    expect(within(dialog).getByText('They will be logged out immediately, on every device.')).toBeInTheDocument()
    expect(calls.some((c) => c.path.endsWith('/deactivate'))).toBe(false)

    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls.filter((c) => c.method === 'POST' && c.path === '/auth/staff/rec-1/deactivate')).toHaveLength(1)
  })

  it('reactivates an inactive account after confirming', async () => {
    const calls = staffGateway({ 'POST /auth/staff/doc-2/reactivate': () => ({ body: { ...staffList[2], active: true } }) })
    renderStaff()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Reactivate Dr. Omar Nabil' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Reactivate Dr. Omar Nabil?' })).getByRole('button', { name: 'Reactivate' }))
    await waitFor(() => expect(calls.some((c) => c.path === '/auth/staff/doc-2/reactivate')).toBe(true))
  })

  it("won't let an admin deactivate themselves or drop their own admin role", async () => {
    staffGateway()
    renderStaff()
    const user = userEvent.setup()

    expect(await screen.findByRole('button', { name: 'Deactivate Demo Admin' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Change roles for Demo Admin' }))
    expect(within(screen.getByRole('dialog')).getByRole('checkbox', { name: /Admin/ })).toBeDisabled()
  })
})

describe('normalizePhone', () => {
  it('accepts Egyptian mobiles as staff type them', () => {
    expect(normalizePhone('010 1234 5678')).toBe('+201012345678')
    expect(normalizePhone('+20 101-234-5678')).toBe('+201012345678')
    expect(normalizePhone('00201012345678')).toBe('+201012345678')
    expect(normalizePhone('٠١٠١٢٣٤٥٦٧٨')).toBe('+201012345678')
  })

  it('refuses anything else', () => {
    expect(normalizePhone('0101234567')).toBeNull()
    expect(normalizePhone('+441234567890')).toBeNull()
    expect(normalizePhone('')).toBeNull()
  })
})
