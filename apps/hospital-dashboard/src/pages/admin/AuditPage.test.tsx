import { QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.tsx'
import { session, type AuditPage } from '../../lib/api.ts'
import { Providers } from '../../Providers.tsx'
import { adminUser, auditEntry, fakeGateway } from '../../test-fixtures.ts'

function renderAudit() {
  return render(
    <MemoryRouter initialEntries={['/admin/audit']}>
      <Providers queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </Providers>
    </MemoryRouter>,
  )
}

const firstPage: AuditPage = {
  nextCursor: 'page-2',
  entries: [
    auditEntry('3', { actor: { id: 'rec-1', name: 'Nadia Hassan', type: 'STAFF' }, action: 'ACCESS_DENIED', outcome: 'DENIED', entityType: 'APPOINTMENT', entityId: '3c2d1e0f-9a8b-4c7d-8e6f-5a4b3c2d1e0f' }),
    auditEntry('2', { actor: null, action: 'LOGIN_FAILED', outcome: 'FAILED', entityType: null, entityId: null, ip: '41.33.12.7' }),
    auditEntry('1'),
  ],
}
const secondPage: AuditPage = { nextCursor: null, entries: [auditEntry('0', { action: 'LOGIN', entityType: null, entityId: null, occurredAt: '2026-11-05T06:00:00Z' })] }

function auditGateway() {
  return fakeGateway({
    'GET /auth/me': () => ({ body: adminUser }),
    'GET /admin/audit-log': (url) => ({ body: url.searchParams.get('cursor') === 'page-2' ? secondPage : firstPage }),
  })
}

function auditQueries(): URLSearchParams[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((u) => u.pathname.endsWith('/admin/audit-log'))
    .map((u) => u.searchParams)
}

beforeEach(() => {
  session.token = 'admin-token'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Audit log', () => {
  it('lists who did what to which record, and how it ended', async () => {
    auditGateway()
    renderAudit()

    const table = await screen.findByRole('table', { name: 'Audit log' })
    const denied = within(table).getByText('Access refused').closest('tr')!
    expect(within(denied).getByText('Nadia Hassan')).toBeInTheDocument()
    expect(within(denied).getByText('Refused')).toBeInTheDocument()
    expect(within(denied).getAllByText('#3c2d1e0f').length).toBeGreaterThan(0)
    const failed = within(table).getByText('Failed login').closest('tr')!
    expect(within(failed).getByText('Not signed in')).toBeInTheDocument()
    expect(within(failed).getByText('Failed')).toBeInTheDocument()
    expect(within(failed).getByText('10:21')).toBeInTheDocument()
  })

  it('is read-only: there is nothing to edit or delete', async () => {
    auditGateway()
    renderAudit()

    const table = await screen.findByRole('table', { name: 'Audit log' })
    expect(within(table).queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /edit|delete|remove/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Nothing here can be edited or deleted/)).toBeInTheDocument()
  })

  it('searches by who, action and time range', async () => {
    auditGateway()
    renderAudit()
    const user = userEvent.setup()

    await screen.findByRole('table', { name: 'Audit log' })
    await user.type(screen.getByRole('searchbox', { name: 'Who' }), 'Nadia')
    await waitFor(() => expect(auditQueries().at(-1)!.get('who')).toBe('Nadia'))

    await user.click(screen.getByRole('combobox', { name: 'Action' }))
    await user.click(screen.getByRole('option', { name: 'Result released' }))
    await waitFor(() => expect(auditQueries().at(-1)!.get('action')).toBe('RESULT_RELEASED'))

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-06' } })
    await waitFor(() => expect(auditQueries().at(-1)!.toString()).toBe('who=Nadia&action=RESULT_RELEASED&from=2026-11-01&to=2026-11-06'))

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(auditQueries().at(-1)!.toString()).toBe(''))
  })

  it("won't search a range that ends before it starts", async () => {
    auditGateway()
    renderAudit()

    await screen.findByRole('table', { name: 'Audit log' })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-06' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-01' } })
    expect((await screen.findAllByText('The start day is after the end day.')).length).toBeGreaterThan(0)
    expect(auditQueries().filter((q) => q.get('to') === '2026-11-01')).toHaveLength(0)
  })

  it('loads older entries with the cursor, then says where the log starts', async () => {
    auditGateway()
    renderAudit()
    const user = userEvent.setup()

    await screen.findByRole('table', { name: 'Audit log' })
    expect(screen.getByText('Entries shown: 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load older entries' }))

    expect(await screen.findByText('Logged in')).toBeInTheDocument()
    expect(auditQueries().at(-1)!.get('cursor')).toBe('page-2')
    expect(screen.getByText('Entries shown: 4')).toBeInTheDocument()
    expect(screen.getByText('Start of the log')).toBeInTheDocument()
  })
})
