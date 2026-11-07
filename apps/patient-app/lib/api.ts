import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
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
export type QueuePosition = components['schemas']['QueuePosition'];
export type Journey = components['schemas']['Journey'];
export type JourneyStageCode = components['schemas']['JourneyStageCode'];
export type PatientResult = components['schemas']['PatientResult'];
export type ResultFile = components['schemas']['ResultFile'];
export type VisitSummary = components['schemas']['VisitSummary'];

/** A released result file saved in the app's private cache, ready to open or share. */
export interface DownloadedResultFile {
  testId: string;
  /** Local `file://` URI of the saved copy. */
  uri: string;
  contentType: string;
  sizeBytes: number;
}

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
  clearDownloadedResults();
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

async function send(
  path: string,
  method: NonNullable<RequestOptions['method']>,
  headers: Record<string, string>,
  authenticated: boolean,
  body?: string,
): Promise<Response> {
  if (authenticated && sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  try {
    return await fetch(`${getApiBaseUrl()}${path}`, { method, headers, body });
  } catch {
    throw new ApiClientError(0, 'INTERNAL', 'Network request failed');
  }
}

/** Turns a non-2xx response into an ApiClientError (and drops the session on 401). */
async function toApiError(response: Response, authenticated: boolean): Promise<ApiClientError> {
  let parsed: unknown = null;
  try {
    const text = await response.text();
    if (text.length > 0) {
      parsed = JSON.parse(text);
    }
  } catch {
    parsed = null;
  }
  const errObj = (parsed as Partial<ApiErrorBody> | null)?.error;
  const fallback: ErrorCode =
    response.status === 401 ? 'UNAUTHENTICATED' : response.status === 404 ? 'NOT_FOUND' : 'INTERNAL';
  if (response.status === 401 && authenticated) {
    clearSession();
  }
  return new ApiClientError(
    response.status,
    errObj?.code ?? fallback,
    errObj?.message ?? `HTTP ${response.status}`,
    errObj?.details,
  );
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, authenticated = true } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await send(
    path,
    method,
    headers,
    authenticated,
    body !== undefined ? JSON.stringify(body) : undefined,
  );

  if (!response.ok) {
    throw await toApiError(response, authenticated);
  }
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (text.length === 0) {
    return null as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null as T;
  }
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

/** Queue position and patient journey endpoints */
export async function getQueuePosition(appointmentId: string): Promise<QueuePosition> {
  return request<QueuePosition>(
    `/appointments/${encodeURIComponent(appointmentId)}/queue-position`,
    {
      method: 'GET',
      authenticated: true,
    },
  );
}

export async function getAppointmentJourney(appointmentId: string): Promise<Journey> {
  return request<Journey>(`/appointments/${encodeURIComponent(appointmentId)}/journey`, {
    method: 'GET',
    authenticated: true,
  });
}

/** Test results and visit summary endpoints (KAN-16) */
export async function listMyResults(): Promise<PatientResult[]> {
  return request<PatientResult[]>('/me/results', {
    method: 'GET',
    authenticated: true,
  });
}

/** Result files the contract allows, and the extension each is saved with. */
const RESULT_FILE_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** Private cache folder for downloaded results; emptied on logout. */
function resultsDirectory(): Directory {
  return new Directory(Paths.cache, 'results');
}

/** Deletes every result file this app saved (called when the session ends). */
export function clearDownloadedResults(): void {
  try {
    const dir = resultsDirectory();
    if (dir.exists) {
      dir.delete();
    }
  } catch {
    // Nothing saved, or the platform has no file system (web): nothing to clear.
  }
}

/**
 * Downloads a released result through the gateway with the session token and saves the
 * bytes to the app's private cache. The file is never exposed through a public link.
 * The local name comes from the test ID, not the server's file name.
 */
export async function downloadTestResult(testId: string): Promise<DownloadedResultFile> {
  const response = await send(
    `/tests/${encodeURIComponent(testId)}/result/file`,
    'GET',
    { Accept: Object.keys(RESULT_FILE_EXTENSIONS).join(', ') },
    true,
  );
  if (!response.ok) {
    throw await toApiError(response, true);
  }

  const contentType =
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ??
    'application/octet-stream';
  const extension = RESULT_FILE_EXTENSIONS[contentType] ?? 'bin';
  const bytes = new Uint8Array(await response.arrayBuffer());

  const dir = resultsDirectory();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  const file = new File(dir, `${testId}.${extension}`);
  file.create({ overwrite: true });
  await file.write(bytes);

  return { testId, uri: file.uri, contentType, sizeBytes: bytes.byteLength };
}

export async function getVisitSummary(appointmentId: string): Promise<VisitSummary> {
  return request<VisitSummary>(
    `/appointments/${encodeURIComponent(appointmentId)}/summary`,
    {
      method: 'GET',
      authenticated: true,
    },
  );
}
