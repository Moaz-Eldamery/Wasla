import type { components } from './api-types.ts'

type Schemas = components['schemas']

export type ErrorCode = Schemas['ErrorCode']
export type LocalizedText = Schemas['LocalizedText']
export type User = Schemas['User']
export type StaffRole = Schemas['StaffRole']
export type LoginRequest = Schemas['LoginRequest']
export type LoginResponse = Schemas['LoginResponse']
export type Clinic = Schemas['Clinic']
export type Appointment = Schemas['Appointment']
export type AppointmentStatus = Schemas['AppointmentStatus']
export type QueueItem = Schemas['QueueItem']
export type QueueBoard = Schemas['QueueBoard']

/** A non-2xx answer from the gateway, or a network failure (`status` 0). */
export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly details?: { field: string; problem: string }[]

  constructor(status: number, code: ErrorCode, message: string, details?: { field: string; problem: string }[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * Where the gateway is. By default the website calls `/api/...` on its own
 * origin and the Vite dev server forwards it (see vite.config.ts), so the
 * browser never makes a cross-origin call. VITE_API_URL overrides it.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/+$/, '')

const TOKEN_KEY = 'wasla.session'

/**
 * The session token lives in sessionStorage: it survives a page reload but
 * ends when the tab closes, which suits shared front-desk computers.
 */
export const session = {
  get token(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set token(value: string | null) {
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, value)
      else sessionStorage.removeItem(TOKEN_KEY)
    } catch {
      // Storage can be blocked; the session then lasts until the page reloads.
    }
  },
}

/** Called when the gateway says the session is gone, so the app can go back to login. */
let onUnauthenticated: (() => void) | null = null
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT'
  body?: unknown
  query?: Record<string, string | undefined>
  /** Public auth endpoints don't send the token. */
  anonymous?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, anonymous = false } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = session.token
  if (token && !anonymous) headers.Authorization = `Bearer ${token}`

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) search.set(key, value)
  }
  const qs = search.toString()

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'INTERNAL', 'The server could not be reached.')
  }

  if (response.ok) {
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  let payload: Schemas['Error'] | null = null
  try {
    payload = (await response.json()) as Schemas['Error']
  } catch {
    // The gateway's own errors (rate limit, body limit) may not be JSON.
  }
  const fallback: ErrorCode =
    response.status === 401 ? 'UNAUTHENTICATED'
    : response.status === 403 ? 'FORBIDDEN'
    : response.status === 404 ? 'NOT_FOUND'
    : response.status === 429 ? 'RATE_LIMITED'
    : 'INTERNAL'
  const error = new ApiError(
    response.status,
    payload?.error?.code ?? fallback,
    payload?.error?.message ?? response.statusText,
    payload?.error?.details,
  )
  if (response.status === 401 && !anonymous) {
    session.token = null
    onUnauthenticated?.()
  }
  throw error
}

// ------------------------------------------------------------------ auth

export function login(body: LoginRequest): Promise<LoginResponse> {
  return request('/auth/login', { method: 'POST', body, anonymous: true })
}

export function logout(): Promise<void> {
  return request('/auth/logout', { method: 'POST' })
}

export function getMe(): Promise<User> {
  return request('/auth/me')
}

// ------------------------------------------------------------------ clinics and appointments

export function listMyClinics(): Promise<Clinic[]> {
  return request('/me/clinics')
}

/** `date` is a calendar day in Cairo time, `YYYY-MM-DD`; today when left out. */
export function listClinicAppointments(clinicId: string, date?: string): Promise<Appointment[]> {
  return request(`/clinics/${encodeURIComponent(clinicId)}/appointments`, { query: { date } })
}

export function checkIn(appointmentId: string): Promise<Appointment> {
  return request(`/appointments/${encodeURIComponent(appointmentId)}/check-in`, { method: 'POST' })
}

export function getClinicQueue(clinicId: string): Promise<QueueBoard> {
  return request(`/clinics/${encodeURIComponent(clinicId)}/queue`)
}
