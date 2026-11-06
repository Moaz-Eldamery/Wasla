import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.tsx'
import { session, type ChatbotAnswer, type User } from '../../lib/api.ts'
import { Providers } from '../../Providers.tsx'
import { fakeGateway } from '../../test-fixtures.ts'

const admin: User = { id: 'admin-1', type: 'STAFF', name: 'Demo Admin', phone: null, email: 'admin@hospital.test', roles: ['ADMIN'] }

const visiting: ChatbotAnswer = {
  status: 'ANSWERED',
  answer: 'Visiting hours are 4 pm to 8 pm every day.',
  language: 'en',
  sources: [{ entryId: 'kb-12', title: { en: 'Visiting hours', ar: 'مواعيد الزيارة' } }],
}

function renderChat() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Providers queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <App />
      </Providers>
    </MemoryRouter>,
  )
}

function chatGateway(answer: () => { status?: number; body?: unknown }) {
  return fakeGateway({
    'GET /auth/me': () => ({ body: admin }),
    'POST /admin/chatbot/messages': answer,
  })
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  session.token = 'admin-token'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Admin assistant', () => {
  it('answers a typed question with its sources', async () => {
    const calls = chatGateway(() => ({ body: visiting }))
    renderChat()
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox', { name: 'Your question' }), 'When can families visit?{Enter}')

    expect(await screen.findByText('Visiting hours are 4 pm to 8 pm every day.')).toBeInTheDocument()
    const thread = screen.getByRole('list', { name: 'Conversation' })
    expect(within(thread).getByText('When can families visit?')).toBeInTheDocument()
    expect(within(thread).getByText('Visiting hours')).toBeInTheDocument()
    const sent = calls.find((c) => c.path === '/admin/chatbot/messages')!
    expect(JSON.parse(String(sent.init.body))).toEqual({ question: 'When can families visit?' })
    expect(screen.getByRole('textbox', { name: 'Your question' })).toHaveValue('')
  })

  it('says plainly when the assistant has no information', async () => {
    chatGateway(() => ({ body: { status: 'NO_INFORMATION', answer: '', language: 'en', sources: [] } }))
    renderChat()

    await userEvent.setup().type(await screen.findByRole('textbox', { name: 'Your question' }), 'Who won the match?{Enter}')

    expect(await screen.findByText(/doesn't have that information/)).toBeInTheDocument()
  })

  it('explains when the assistant is down, and asks again', async () => {
    let down = true
    const calls = chatGateway(() =>
      down ? { status: 503, body: { error: { code: 'AI_UNAVAILABLE', message: 'AI down' } } } : { body: visiting },
    )
    renderChat()
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox', { name: 'Your question' }), 'Visiting hours?{Enter}')
    expect(await screen.findByText(/The assistant is unavailable right now/)).toBeInTheDocument()

    down = false
    await user.click(screen.getByRole('button', { name: 'Ask again' }))
    expect(await screen.findByText('Visiting hours are 4 pm to 8 pm every day.')).toBeInTheDocument()
    expect(calls.filter((c) => c.path === '/admin/chatbot/messages')).toHaveLength(2)
    expect(screen.getAllByText('Visiting hours?')).toHaveLength(1)
  })

  it('asks a suggested question in one click', async () => {
    const calls = chatGateway(() => ({ body: visiting }))
    renderChat()

    await userEvent.setup().click(await screen.findByRole('button', { name: 'What are the visiting hours?' }))

    expect(await screen.findByText('Visiting hours are 4 pm to 8 pm every day.')).toBeInTheDocument()
    expect(JSON.parse(String(calls.find((c) => c.path === '/admin/chatbot/messages')!.init.body)).question).toBe('What are the visiting hours?')
  })

  it('keeps the conversation through a reload, and New conversation clears it', async () => {
    chatGateway(() => ({ body: visiting }))
    const first = renderChat()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'What are the visiting hours?' }))
    await screen.findByText('Visiting hours are 4 pm to 8 pm every day.')
    first.unmount()

    renderChat()
    expect(await screen.findByText('Visiting hours are 4 pm to 8 pm every day.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New conversation' }))
    expect(screen.queryByText('Visiting hours are 4 pm to 8 pm every day.')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('wasla.chat')).toBeNull()
  })

  it('stops a question over 1,000 characters before sending', async () => {
    const calls = chatGateway(() => ({ body: visiting }))
    renderChat()
    const user = userEvent.setup()
    const box = await screen.findByRole('textbox', { name: 'Your question' })

    await user.click(box)
    await user.paste('a'.repeat(1001))

    expect(screen.getByText('Questions can be at most 1000 characters.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await user.keyboard('{Enter}')
    expect(calls.some((c) => c.path === '/admin/chatbot/messages')).toBe(false)
  })

  it('Shift+Enter adds a new line instead of sending', async () => {
    const calls = chatGateway(() => ({ body: visiting }))
    renderChat()
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox', { name: 'Your question' }), 'Line one{Shift>}{Enter}{/Shift}Line two')

    expect(screen.getByRole('textbox', { name: 'Your question' })).toHaveValue('Line one\nLine two')
    expect(calls.some((c) => c.path === '/admin/chatbot/messages')).toBe(false)
  })
})
