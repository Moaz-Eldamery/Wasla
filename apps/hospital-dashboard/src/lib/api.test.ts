import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeGateway } from '../test-fixtures.ts'
import { ApiError, checkIn, listClinicAppointments, login, session, setUnauthenticatedHandler } from './api.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  setUnauthenticatedHandler(null)
})

describe('api client', () => {
  it('calls the gateway through /api with the session token', async () => {
    const calls = fakeGateway({ 'GET /clinics/c1/appointments': () => ({ body: [] }) })
    session.token = 'tok-123'

    await listClinicAppointments('c1', '2026-11-06')

    expect(calls[0].path).toBe('/clinics/c1/appointments')
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/clinics/c1/appointments?date=2026-11-06')
    expect(new Headers(calls[0].init.headers).get('Authorization')).toBe('Bearer tok-123')
  })

  it('does not send the token to the public login endpoint', async () => {
    const calls = fakeGateway({ 'POST /auth/login': () => ({ body: { token: 't', expiresAt: '', user: {} } }) })
    session.token = 'old'

    await login({ phone: '+201000000010', password: 'secret123' })

    expect(new Headers(calls[0].init.headers).get('Authorization')).toBeNull()
  })

  it('turns an error body into an ApiError with its code', async () => {
    fakeGateway({
      'POST /appointments/a1/check-in': () => ({
        status: 409,
        body: { error: { code: 'INVALID_TRANSITION', message: 'Already checked in' } },
      }),
    })

    await expect(checkIn('a1')).rejects.toMatchObject({ status: 409, code: 'INVALID_TRANSITION' })
  })

  it('ends the session when the gateway answers 401', async () => {
    fakeGateway({ 'GET /clinics/c1/appointments': () => ({ status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'No session' } } }) })
    session.token = 'expired'
    const onUnauthenticated = vi.fn()
    setUnauthenticatedHandler(onUnauthenticated)

    await expect(listClinicAppointments('c1')).rejects.toBeInstanceOf(ApiError)
    expect(session.token).toBeNull()
    expect(onUnauthenticated).toHaveBeenCalledOnce()
  })

  it('reports an unreachable server as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(listClinicAppointments('c1')).rejects.toMatchObject({ status: 0 })
  })
})
