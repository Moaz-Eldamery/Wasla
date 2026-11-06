import Constants from 'expo-constants';
import type { components } from './api-types';

export type ErrorCode = components['schemas']['ErrorCode'];
export type ApiErrorBody = components['schemas']['Error'];
export type LocalizedText = components['schemas']['LocalizedText'];
export type User = components['schemas']['User'];
export type RegisterRequest = components['schemas']['RegisterRequest'];
export type CodeSent = components['schemas']['CodeSent'];
export type VerifyPhoneRequest = components['schemas']['VerifyPhoneRequest'];
export type LoginRequest = components['schemas']['LoginRequest'];
export type LoginResponse = components['schemas']['LoginResponse'];
export type Department = components['schemas']['Department'];
export type Clinic = components['schemas']['Clinic'];
export type Doctor = components['schemas']['Doctor'];
export type Slot = components['schemas']['Slot'];
export type Appointment = components['schemas']['Appointment'];
export type AppointmentStatus = components['schemas']['AppointmentStatus'];

/** Error thrown when the backend returns a non-2xx response or network error. */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: { field: string; problem: string }[];

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details?: { field: string; problem: string }[],
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Resolves the API gateway URL.
 * Defaults to http://localhost:8080 (the local Traefik gateway).
 * Set EXPO_PUBLIC_API_URL=http://localhost:4010 to use `pnpm mock`.
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.replace(/\/+$/, '');
  }
  const extraUrl = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (extraUrl && extraUrl.trim().length > 0) {
    return extraUrl.replace(/\/+$/, '');
  }
  return 'http://localhost:8080';
}

let sessionToken: string | null = null;
let currentUser: User | null = null;
let pendingPhone: string | null = null;
let pendingSimulatedCode: string | null = null;
const authListeners = new Set<() => void>();

function notifyAuthListeners() {
  for (const listener of authListeners) {
    listener();
  }
}

export function subscribeAuth(listener: () => void): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export function getSessionToken(): string | null {
  return sessionToken;
}

export function getCurrentUser(): User | null {
  return currentUser;
}

export function setSession(token: string | null, user: User | null = null): void {
  sessionToken = token;
  currentUser = user;
  notifyAuthListeners();
}

export function clearSession(): void {
  sessionToken = null;
  currentUser = null;
  notifyAuthListeners();
}

export function setPendingVerification(phone: string | null, simulatedCode?: string | null): void {
  pendingPhone = phone;
  pendingSimulatedCode = simulatedCode ?? null;
}

export function getPendingVerification(): { phone: string | null; simulatedCode: string | null } {
  return { phone: pendingPhone, simulatedCode: pendingSimulatedCode };
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  authenticated?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, authenticated = true } = options;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (authenticated && sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiClientError(0, 'INTERNAL', 'Network request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let parsed: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const errObj = (parsed as Partial<ApiErrorBody> | null)?.error;
    const code: ErrorCode = errObj?.code ?? (response.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL');
    const message = errObj?.message ?? `HTTP ${response.status}`;
    if (response.status === 401 && authenticated) {
      clearSession();
    }
    throw new ApiClientError(response.status, code, message, errObj?.details);
  }

  return parsed as T;
}

/** Auth endpoints */
export async function registerPatient(input: RegisterRequest): Promise<CodeSent> {
  const result = await request<CodeSent>('/auth/register', {
    method: 'POST',
    body: input,
    authenticated: false,
  });
  setPendingVerification(input.phone, result.simulatedCode ?? null);
  return result;
}

export async function verifyPhone(input: VerifyPhoneRequest): Promise<void> {
  await request<void>('/auth/verify-phone', {
    method: 'POST',
    body: input,
    authenticated: false,
  });
}

export async function resendVerificationCode(phone: string): Promise<CodeSent> {
  const result = await request<CodeSent>('/auth/resend-code', {
    method: 'POST',
    body: { phone },
    authenticated: false,
  });
  setPendingVerification(phone, result.simulatedCode ?? null);
  return result;
}

export async function login(input: LoginRequest): Promise<LoginResponse> {
  const result = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: input,
    authenticated: false,
  });
  setSession(result.token, result.user);
  return result;
}

export async function logout(): Promise<void> {
  try {
    await request<void>('/auth/logout', {
      method: 'POST',
      authenticated: true,
    });
  } finally {
    clearSession();
  }
}

export async function fetchMe(): Promise<User> {
  const user = await request<User>('/auth/me', {
    method: 'GET',
    authenticated: true,
  });
  currentUser = user;
  notifyAuthListeners();
  return user;
}

/** Booking and appointment endpoints */
export async function listDepartments(
  kind: components['schemas']['DepartmentKind'] = 'CLINICAL',
): Promise<Department[]> {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return request<Department[]>(`/departments${query}`, {
    method: 'GET',
    authenticated: true,
  });
}

export async function listDepartmentDoctors(departmentId: string): Promise<Doctor[]> {
  return request<Doctor[]>(`/departments/${encodeURIComponent(departmentId)}/doctors`, {
    method: 'GET',
    authenticated: true,
  });
}

export async function listDoctorFreeSlots(
  doctorId: string,
  params?: { from?: string; to?: string },
): Promise<Slot[]> {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  const query = search.toString() ? `?${search.toString()}` : '';
  return request<Slot[]>(`/doctors/${encodeURIComponent(doctorId)}/slots${query}`, {
    method: 'GET',
    authenticated: true,
  });
}

export async function bookAppointment(slotId: string): Promise<Appointment> {
  return request<Appointment>('/appointments', {
    method: 'POST',
    body: { slotId },
    authenticated: true,
  });
}

export async function listMyAppointments(
  when: 'upcoming' | 'past' = 'upcoming',
): Promise<Appointment[]> {
  return request<Appointment[]>(`/me/appointments?when=${encodeURIComponent(when)}`, {
    method: 'GET',
    authenticated: true,
  });
}
