import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.tsx'
import { session, type User } from '../../lib/api.ts'
import { Providers } from '../../Providers.tsx'
import { adminDepartments, adminUser, fakeGateway, NOW, receptionist, statistics } from '../../test-fixtures.ts'
import { setLanguage } from '../../translations/i18n.ts'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Providers queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </Providers>
    </MemoryRouter>,
  )
}

function signedInAs(user: User) {
  return fakeGateway({
    'GET /auth/me': () => ({ body: user }),
    'GET /admin/departments': () => ({ body: adminDepartments() }),
    'GET /admin/statistics': () => ({ body: statistics() }),
    'GET /auth/staff': () => ({ body: [] }),
    'GET /admin/audit-log': () => ({ body: { entries: [], nextCursor: null } }),
    'GET /me/clinics': () => ({ body: [] }),
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Element.prototype.scrollIntoView = vi.fn()
  session.token = 'token'
})

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  await setLanguage('en')
})

describe('Admin access and navigation', () => {
  it('opens on Statistics with the five sections in the menu', async () => {
    signedInAs(adminUser)
    renderAt('/admin')

    expect(await screen.findByRole('heading', { level: 1, name: 'Statistics' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Statistics', 'Assistant', 'Staff', 'Departments & clinics', 'Audit log'])
    expect(within(nav).getByRole('link', { name: 'Statistics' })).toHaveClass('active')
  })

  it('moves between sections from the menu', async () => {
    signedInAs(adminUser)
    renderAt('/admin')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('link', { name: 'Audit log' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Audit log' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Staff' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Staff' })).toBeInTheDocument()
  })

  it('shows "not allowed" to other roles opening an admin page by URL, and never asks for its data', async () => {
    const calls = signedInAs(receptionist)
    renderAt('/admin/staff')

    expect(await screen.findByRole('heading', { name: "You can't open this page" })).toBeInTheDocument()
    expect(screen.getByText(/staff with the Admin role/)).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Admin sections' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to my screen' })).toHaveAttribute('href', '/reception')
    expect(calls.some((c) => c.path.startsWith('/auth/staff') || c.path.startsWith('/admin/'))).toBe(false)
  })

  it('lays the menu out in Arabic', async () => {
    await setLanguage('ar')
    signedInAs(adminUser)
    renderAt('/admin/statistics')

    const nav = await screen.findByRole('navigation', { name: 'أقسام الإدارة' })
    expect(within(nav).getByRole('link', { name: 'الأقسام والعيادات' })).toBeInTheDocument()
    expect(document.documentElement.dir).toBe('rtl')
  })
})
