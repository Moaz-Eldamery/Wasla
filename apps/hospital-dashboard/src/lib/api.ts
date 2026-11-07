import type { components } from './api-types.ts'

type Schemas = components['schemas']

export type ErrorCode = Schemas['ErrorCode']
export type LocalizedText = Schemas['LocalizedText']
export type User = Schemas['User']
export type StaffRole = Schemas['StaffRole']
export type StaffLoginRequest = Schemas['StaffLoginRequest']
export type LoginResponse = Schemas['LoginResponse']
export type Clinic = Schemas['Clinic']
export type Appointment = Schemas['Appointment']
export type AppointmentStatus = Schemas['AppointmentStatus']
export type QueueItem = Schemas['QueueItem']
export type QueueBoard = Schemas['QueueBoard']
export type Department = Schemas['Department']
export type VisitNotes = Schemas['VisitNotes']
export type SaveVisitNotesRequest = Schemas['SaveVisitNotesRequest']
export type TestOrder = Schemas['TestOrder']
export type TestStatus = Schemas['TestStatus']
export type OrderTestRequest = Schemas['OrderTestRequest']
export type ChatbotAnswer = Schemas['ChatbotAnswer']

// Admin screens: staff (auth service), hospital setup, statistics and the audit log (core).
export type StaffMember = Schemas['StaffMember']
export type NewStaffRequest = Schemas['NewStaffRequest']
export type NewStaffResponse = Schemas['NewStaffResponse']
export type AdminDepartment = Schemas['AdminDepartment']
export type AdminClinic = Schemas['AdminClinic']
export type AssignedStaff = Schemas['AssignedStaff']
export type DepartmentKind = Schemas['DepartmentKind']
export type ClinicRequest = Schemas['ClinicRequest']
export type Statistics = Schemas['Statistics']
export type StatisticsDay = Schemas['StatisticsDay']
export type AuditAction = Schemas['AuditAction']
export type AuditEntityType = Schemas['AuditEntityType']
export type AuditEntry = Schemas['AuditEntry']
export type AuditPage = Schemas['AuditPage']

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
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
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

/** Staff log in to the website with their work email (patients use the app). */
export function login(body: StaffLoginRequest): Promise<LoginResponse> {
  return request('/auth/staff/login', { method: 'POST', body, anonymous: true })
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

export function listDepartments(): Promise<Department[]> {
  return request('/departments')
}

// ------------------------------------------------------------------ doctor

/** The signed-in doctor's appointments for one Cairo day (today when left out). */
export function listDoctorAppointments(date?: string): Promise<Appointment[]> {
  return request('/doctors/me/appointments', { query: { date } })
}

/** Calls the earliest checked-in patient in this clinic (CHECKED_IN → IN_CONSULTATION). */
export function callNextPatient(clinicId: string): Promise<Appointment> {
  return request('/doctors/me/queue/call-next', { method: 'POST', body: { clinicId } })
}

/** Finishes the visit (IN_CONSULTATION → COMPLETED). */
export function completeVisit(appointmentId: string): Promise<Appointment> {
  return request(`/appointments/${encodeURIComponent(appointmentId)}/complete`, { method: 'POST' })
}

/** The latest notes, or null when none have been written yet (the API answers 404). */
export async function getVisitNotes(appointmentId: string): Promise<VisitNotes | null> {
  try {
    return await request<VisitNotes>(`/appointments/${encodeURIComponent(appointmentId)}/notes`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Saves a new version. `baseVersion` is the version edited (0 for the first); a newer save gives 409 VERSION_CONFLICT. */
export function saveVisitNotes(appointmentId: string, body: SaveVisitNotesRequest): Promise<VisitNotes> {
  return request(`/appointments/${encodeURIComponent(appointmentId)}/notes`, { method: 'PUT', body })
}

export function listVisitTests(appointmentId: string): Promise<TestOrder[]> {
  return request(`/appointments/${encodeURIComponent(appointmentId)}/tests`)
}

export function orderTest(appointmentId: string, body: OrderTestRequest): Promise<TestOrder> {
  return request(`/appointments/${encodeURIComponent(appointmentId)}/tests`, { method: 'POST', body })
}

/** Releases the result to the patient (AWAITING_REVIEW → RELEASED). */
export function releaseTestResult(testId: string): Promise<TestOrder> {
  return request(`/tests/${encodeURIComponent(testId)}/release`, { method: 'POST' })
}

/** Fetches the private result file with the session and returns it as a Blob to open in a new tab. */
export async function downloadTestResult(testId: string): Promise<Blob> {
  const token = session.token
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/tests/${encodeURIComponent(testId)}/result/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    throw new ApiError(0, 'INTERNAL', 'The server could not be reached.')
  }
  if (!response.ok) {
    throw new ApiError(response.status, response.status === 404 ? 'NOT_FOUND' : 'INTERNAL', response.statusText)
  }
  return response.blob()
}

// ------------------------------------------------------------------ lab

/** Tests ordered for the lab staff member's clinics, oldest first; all statuses when `status` is left out. */
export function listLabTests(status?: TestStatus): Promise<TestOrder[]> {
  return request('/lab/tests', { query: { status } })
}

/** Marks a test as started (REQUESTED → IN_PROGRESS). */
export function startTest(testId: string): Promise<TestOrder> {
  return request(`/tests/${encodeURIComponent(testId)}/start`, { method: 'POST' })
}

/** What the API accepts as a result file. */
export const RESULT_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export const RESULT_FILE_MAX_BYTES = 10 * 1024 * 1024

/** Uploads the result (IN_PROGRESS → AWAITING_REVIEW); uploading again before release replaces the file. */
export async function uploadTestResult(testId: string, file: File): Promise<TestOrder> {
  const body = new FormData()
  body.append('file', file)
  const token = session.token
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/tests/${encodeURIComponent(testId)}/result`, {
      method: 'POST',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body,
    })
  } catch {
    throw new ApiError(0, 'INTERNAL', 'The server could not be reached.')
  }
  if (response.ok) return (await response.json()) as TestOrder
  let payload: Schemas['Error'] | null = null
  try {
    payload = (await response.json()) as Schemas['Error']
  } catch {
    // The gateway's body limit answers 413 without JSON.
  }
  const fallback: ErrorCode = response.status === 413 ? 'FILE_TOO_LARGE' : response.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL'
  if (response.status === 401) {
    session.token = null
    onUnauthenticated?.()
  }
  throw new ApiError(response.status, payload?.error?.code ?? fallback, payload?.error?.message ?? response.statusText)
}

// ------------------------------------------------------------------ admin assistant

/** The longest question the assistant accepts. */
export const CHAT_QUESTION_MAX = 1000

/** Asks the hospital-information assistant one question; 503 AI_UNAVAILABLE when the AI service is down. */
export function askChatbot(question: string): Promise<ChatbotAnswer> {
  return request('/admin/chatbot/messages', { method: 'POST', body: { question } })
}

// ------------------------------------------------------------------ admin: staff (auth service)

const id = encodeURIComponent

/** Staff accounts, active and inactive, by name. `q` matches part of a name or phone number. */
export function listStaff(filter: { q?: string; status?: 'active' | 'inactive' } = {}): Promise<StaffMember[]> {
  return request('/auth/staff', { query: { q: filter.q || undefined, status: filter.status } })
}

/** Creates the account; the temporary password in the answer is shown once and never again. */
export function createStaff(body: NewStaffRequest): Promise<NewStaffResponse> {
  return request('/auth/staff', { method: 'POST', body })
}

export function setStaffRoles(staffId: string, roles: StaffRole[]): Promise<StaffMember> {
  return request(`/auth/staff/${id(staffId)}/roles`, { method: 'PUT', body: { roles } })
}

/** Deactivating also ends every session the person has, at once. */
export function setStaffActive(staffId: string, active: boolean): Promise<StaffMember> {
  return request(`/auth/staff/${id(staffId)}/${active ? 'reactivate' : 'deactivate'}`, { method: 'POST' })
}

// ------------------------------------------------------------------ admin: departments and clinics

/** Every department with its clinics and assigned staff, inactive ones included. */
export function listAdminDepartments(): Promise<AdminDepartment[]> {
  return request('/admin/departments')
}

export function createDepartment(body: { kind: DepartmentKind; name: LocalizedText }): Promise<AdminDepartment> {
  return request('/admin/departments', { method: 'POST', body })
}

export function renameDepartment(departmentId: string, name: LocalizedText): Promise<AdminDepartment> {
  return request(`/admin/departments/${id(departmentId)}`, { method: 'PUT', body: { name } })
}

export function setDepartmentActive(departmentId: string, active: boolean): Promise<AdminDepartment> {
  return request(`/admin/departments/${id(departmentId)}/${active ? 'reactivate' : 'deactivate'}`, { method: 'POST' })
}

export function createClinic(departmentId: string, body: ClinicRequest): Promise<AdminClinic> {
  return request(`/admin/departments/${id(departmentId)}/clinics`, { method: 'POST', body })
}

export function updateClinic(clinicId: string, body: ClinicRequest): Promise<AdminClinic> {
  return request(`/admin/clinics/${id(clinicId)}`, { method: 'PUT', body })
}

export function setClinicActive(clinicId: string, active: boolean): Promise<AdminClinic> {
  return request(`/admin/clinics/${id(clinicId)}/${active ? 'reactivate' : 'deactivate'}`, { method: 'POST' })
}

export function assignClinicStaff(clinicId: string, staffId: string): Promise<AdminClinic> {
  return request(`/admin/clinics/${id(clinicId)}/staff/${id(staffId)}`, { method: 'PUT' })
}

export function unassignClinicStaff(clinicId: string, staffId: string): Promise<AdminClinic> {
  return request(`/admin/clinics/${id(clinicId)}/staff/${id(staffId)}`, { method: 'DELETE' })
}

// ------------------------------------------------------------------ admin: statistics and audit log

/** Visits, wait and no-show rate per Cairo day from `from` to `to` (YYYY-MM-DD, at most 92 days apart). */
export function getStatistics(filter: { from: string; to: string; departmentId?: string }): Promise<Statistics> {
  return request('/admin/statistics', { query: filter })
}

export interface AuditFilter {
  who?: string
  action?: AuditAction
  from?: string
  to?: string
}

/** One page of the audit log, newest first; pass the previous page's `nextCursor` for the next. */
export function searchAuditLog(filter: AuditFilter, cursor?: string): Promise<AuditPage> {
  return request('/admin/audit-log', { query: { who: filter.who || undefined, action: filter.action, from: filter.from, to: filter.to, cursor } })
}
