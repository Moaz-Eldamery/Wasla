import type { Request, Response } from 'express';
import { ApiError } from '../api-error.js';
import type { SessionService, SessionUser } from '../authentication/session.service.js';
import { AuthorizationController } from './authorization.controller.js';

const TOKEN = 'a'.repeat(43);

function setup(user: SessionUser | null) {
  const sessions = { validate: vi.fn().mockResolvedValue(user) };
  const controller = new AuthorizationController(sessions as unknown as SessionService);
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => (headers[k] = v) } as unknown as Response;
  const req = (authorization?: string) => ({ headers: { authorization } }) as Request;
  return { controller, sessions, headers, res, req };
}

describe('AuthorizationController (forward-auth)', () => {
  it('passes the user on as X-User-* headers', async () => {
    const { controller, headers, res, req } = setup({
      id: 'u1',
      type: 'STAFF',
      name: 'Dr. Test',
      phone: null,
      email: 'doctor@hospital.test',
      roles: ['DOCTOR', 'RECEPTIONIST'],
    });

    await controller.check(req(`Bearer ${TOKEN}`), res);

    expect(headers).toEqual({
      'X-User-Id': 'u1',
      'X-User-Type': 'STAFF',
      'X-User-Roles': 'DOCTOR,RECEPTIONIST',
    });
  });

  it('refuses a missing, expired or revoked session (fails closed)', async () => {
    const { controller, sessions, headers, res, req } = setup(null);

    await expect(controller.check(req(), res)).rejects.toBeInstanceOf(ApiError);
    await expect(controller.check(req(`Bearer ${TOKEN}`), res)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(sessions.validate).toHaveBeenCalledWith(null);
    expect(headers).toEqual({});
  });

  it('refuses when the session check itself fails', async () => {
    const { controller, sessions, res, req } = setup(null);
    sessions.validate.mockRejectedValue(new Error('database down'));

    await expect(controller.check(req(`Bearer ${TOKEN}`), res)).rejects.toThrow('database down');
  });
});
