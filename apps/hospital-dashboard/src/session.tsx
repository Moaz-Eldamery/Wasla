import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  getMe,
  login as apiLogin,
  logout as apiLogout,
  session,
  setUnauthenticatedHandler,
  type StaffLoginRequest,
  type User,
} from './lib/api.ts'


type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: User }

interface SessionValue {
  state: SessionState
  login(body: StaffLoginRequest): Promise<User>
  logout(): Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<SessionState>(() =>
    session.token ? { status: 'loading' } : { status: 'signed-out' },
  )

  const signOutLocally = useCallback(() => {
    session.token = null
    // Nothing from this session stays in the tab: the assistant thread goes too.
    try {
      sessionStorage.removeItem('wasla.chat')
    } catch {
      // Storage blocked: nothing was kept.
    }
    queryClient.clear()
    setState({ status: 'signed-out' })
  }, [queryClient])

  // When any request comes back 401, the session is over.
  useEffect(() => {
    setUnauthenticatedHandler(signOutLocally)
    return () => setUnauthenticatedHandler(null)
  }, [signOutLocally])

  // A reload keeps the token; ask who it belongs to.
  useEffect(() => {
    if (state.status !== 'loading') return
    let cancelled = false
    getMe()
      .then((user) => !cancelled && setState({ status: 'signed-in', user }))
      .catch(() => !cancelled && signOutLocally())
    return () => {
      cancelled = true
    }
  }, [state.status, signOutLocally])

  const value = useMemo<SessionValue>(
    () => ({
      state,
      async login(body) {
        const res = await apiLogin(body)
        session.token = res.token
        setState({ status: 'signed-in', user: res.user })
        return res.user
      },
      async logout() {
        try {
          await apiLogout()
        } finally {
          signOutLocally()
        }
      },
    }),
    [state, signOutLocally],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}

/** The signed-in user; only call it under a route that requires one. */
export function useUser(): User {
  const { state } = useSession()
  if (state.status !== 'signed-in') throw new Error('useUser needs a signed-in session')
  return state.user
}
