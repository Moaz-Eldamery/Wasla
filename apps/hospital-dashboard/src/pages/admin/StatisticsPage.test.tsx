import { QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.tsx'
import { session, type Statistics } from '../../lib/api.ts'
import { Providers } from '../../Providers.tsx'
import { adminDepartments, adminUser, fakeGateway, NOW, statistics } from '../../test-fixtures.ts'
import { addDays, lastDays, niceTicks, OTHER_COLOR, SERIES_COLORS, visitSeries } from './statistics.ts'

function renderStats() {
  return render(
    <MemoryRouter initialEntries={['/admin/statistics']}>
      <Providers queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </Providers>
    </MemoryRouter>,
  )
}

function statsGateway(answer: (url: URL) => Statistics = () => statistics()) {
  return fakeGateway({
    'GET /auth/me': () => ({ body: adminUser }),
    'GET /admin/departments': () => ({ body: adminDepartments() }),
    'GET /admin/statistics': (url) => ({ body: answer(url) }),
  })
}

/** The query strings of every statistics request so far. */
function statsQueries(): URLSearchParams[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(([input]) => new URL(String(input), 'http://localhost'))
    .filter((u) => u.pathname.endsWith('/admin/statistics'))
    .map((u) => u.searchParams)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  session.token = 'admin-token'
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Statistics', () => {
  it('shows the last 7 days: visits, average wait and no-show rate for the whole range', async () => {
    statsGateway()
    renderStats()

    const visits = await screen.findByRole('region', { name: 'Visits' })
    expect(within(visits).getByText('407')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Average wait' })).getByText('25 min')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'No-show rate' })).getByText('7.9%')).toBeInTheDocument()
    expect(within(visits).getByRole('list', { name: 'Departments' })).toHaveTextContent('Internal MedicineDermatology')
    expect(statsQueries()[0].toString()).toBe('from=2026-10-31&to=2026-11-06')
  })

  it('reads each day from the table view, with "Not available" instead of zero', async () => {
    statsGateway()
    renderStats()
    const user = userEvent.setup()

    const visits = await screen.findByRole('region', { name: 'Visits' })
    await user.click(within(visits).getByRole('button', { name: 'Show as a table' }))
    const table = within(visits).getByRole('table', { name: 'Visits' })
    const friday = within(table).getByText('Friday, 6 November 2026').closest('tr')!
    expect(within(friday).getAllByText('Not available')).toHaveLength(3)
    const saturday = within(table).getByText('Saturday, 31 October 2026').closest('tr')!
    expect(saturday).toHaveTextContent('412768')
  })

  it('reads a day aloud from the keyboard', async () => {
    statsGateway()
    renderStats()

    const chart = await screen.findByRole('group', { name: /^Average wait\./ })
    fireEvent.focus(chart)
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(within(chart).getByRole('status')).toHaveTextContent('Saturday, 31 October 2026. Average wait: 23 min')
    fireEvent.keyDown(chart, { key: 'End' })
    expect(within(chart).getByRole('status')).toHaveTextContent('Friday, 6 November 2026. Not available')
  })

  it('filters by department and by range', async () => {
    statsGateway()
    renderStats()
    const user = userEvent.setup()

    await screen.findByRole('region', { name: 'Visits' })
    await user.click(screen.getByRole('combobox', { name: 'Department' }))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['All clinical departments', 'Internal Medicine', 'Dermatology · Inactive'])
    await user.click(screen.getByRole('option', { name: 'Internal Medicine' }))
    await waitFor(() => expect(statsQueries().at(-1)!.get('departmentId')).toBe('dep-im'))

    await user.click(screen.getByRole('button', { name: 'Last 30 days' }))
    await waitFor(() => expect(statsQueries().at(-1)!.get('from')).toBe('2026-10-08'))
    expect(statsQueries().at(-1)!.get('departmentId')).toBe('dep-im')
  })

  it('refuses a custom range longer than 92 days without asking the server', async () => {
    statsGateway()
    renderStats()
    const user = userEvent.setup()

    await screen.findByRole('region', { name: 'Visits' })
    await user.click(screen.getByRole('button', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } })
    expect(await screen.findByText('Choose at most 92 days.')).toBeInTheDocument()
    expect(statsQueries().some((q) => q.get('from') === '2026-01-01')).toBe(false)
  })

  it('says "Not available" when there is nothing to measure', async () => {
    statsGateway(() => ({
      ...statistics(),
      days: statistics().days.map((d) => ({ ...d, visits: null, averageWaitMinutes: null, noShowRate: null })),
      totals: { visits: null, averageWaitMinutes: null, noShowRate: null },
    }))
    renderStats()

    expect(await screen.findByText('There were no appointments to measure in this range.')).toBeInTheDocument()
    expect(screen.getByText('Not available')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Visits' })).not.toBeInTheDocument()
  })
})

describe('statistics helpers', () => {
  it('counts ranges in Cairo calendar days', () => {
    expect(lastDays('2026-11-06', 7)).toEqual({ from: '2026-10-31', to: '2026-11-06' })
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('picks round axis steps', () => {
    expect(niceTicks(68)).toEqual([0, 20, 40, 60, 80])
    expect(niceTicks(31.2)).toEqual([0, 10, 20, 30, 40])
    expect(niceTicks(0.103)).toEqual([0, 0.05, 0.1, 0.15])
    expect(niceTicks(0)).toEqual([0, 1])
  })

  it('keeps each department’s colour whatever the filter, folding the seventh onwards into Other', () => {
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const dep = (id: string) => ({ id, name: { en: id.toUpperCase(), ar: id } })
    const day = (ids: string[]) => ({ date: '2026-11-01', visits: ids.map((id) => ({ departmentId: id, count: 2 })), averageWaitMinutes: null, noShowRate: null })
    const all = visitSeries({ ...statistics(), departments: order.map(dep), days: [day(order)] }, 'en', 'Other', order)
    expect(all.map((s) => s.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'Other'])
    expect(all.at(-1)).toMatchObject({ color: OTHER_COLOR, values: [4] })

    const onlyC = visitSeries({ ...statistics(), departments: [dep('c')], days: [day(['c'])] }, 'en', 'Other', order)
    expect(onlyC).toEqual([{ key: 'c', label: 'C', color: SERIES_COLORS[2], values: [2] }])
  })
})
