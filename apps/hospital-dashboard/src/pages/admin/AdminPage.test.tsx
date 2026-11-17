import { QueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.tsx'
import { session, type ChatbotAnswer, type User } from '../../lib/api.ts'
import { Providers } from '../../Providers.tsx'
import { fakeGateway, NOW } from '../../test-fixtures.ts'
import { setLanguage } from '../../translations/i18n.ts'

const admin: User = {
  id: 'admin-1',
  type: 'STAFF',
  name: 'Wasla Admin',
  phone: '+201000000005',
  email: 'admin@hospital.test',
  roles: ['ADMIN'],
}

const answer: ChatbotAnswer = {
  status: 'ANSWERED',
  answer: 'The main reception desk is open from 8 AM to 8 PM.',
  language: 'en',
  sources: [{ entryId: 'KB-001', title: { en: 'Main reception hours', ar: 'مواعيد الاستقبال الرئيسي' } }],
}

function renderAdmin() {
  render(
    <MemoryRouter initialEntries={['/admin-chatbot']}>
      <Providers queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </Providers>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  session.token = 'admin-session-token'
})

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  session.token = null
  await setLanguage('en')
})

describe('Admin chatbot screen', () => {
  it('uses the Core chatbot endpoint and displays the answer with its source', async () => {
    let submitted: unknown
    const calls = fakeGateway({
      'GET /auth/me': () => ({ body: admin }),
      'POST /admin/chatbot/messages': (_url, init) => {
        submitted = JSON.parse(String(init.body))
        return { body: answer }
      },
    })
    renderAdmin()

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.type(await screen.findByRole('textbox', { name: 'Your question' }), 'When is reception open?')
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText(answer.answer)).toBeInTheDocument()
    expect(screen.getByText(/Main reception hours/)).toBeInTheDocument()
    expect(submitted).toEqual({ question: 'When is reception open?' })
    const chatbotCall = calls.find((call) => call.path === '/admin/chatbot/messages')!
    expect(new Headers(chatbotCall.init.headers).get('Authorization')).toBe('Bearer admin-session-token')
  })
})
