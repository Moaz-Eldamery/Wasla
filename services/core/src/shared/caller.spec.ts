import { hasRole, readCaller } from './caller.js';

const ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('readCaller', () => {
  it('reads a patient', () => {
    expect(readCaller({ 'x-user-id': ID, 'x-user-type': 'PATIENT', 'x-user-roles': '' })).toEqual({
      id: ID,
      type: 'PATIENT',
      roles: [],
    });
  });

  it('reads a staff member with several roles', () => {
    const caller = readCaller({
      'x-user-id': ID,
      'x-user-type': 'STAFF',
      'x-user-roles': 'DOCTOR, RECEPTIONIST',
    });
    expect(caller?.roles).toEqual(['DOCTOR', 'RECEPTIONIST']);
  });

  it.each([
    ['no headers', {}],
    ['a bad id', { 'x-user-id': 'nope', 'x-user-type': 'PATIENT' }],
    ['an unknown type', { 'x-user-id': ID, 'x-user-type': 'ROBOT' }],
    ['an unknown role', { 'x-user-id': ID, 'x-user-type': 'STAFF', 'x-user-roles': 'JANITOR' }],
    ['a patient with roles', { 'x-user-id': ID, 'x-user-type': 'PATIENT', 'x-user-roles': 'ADMIN' }],
  ])('refuses %s', (_name, headers) => {
    expect(readCaller(headers)).toBeNull();
  });
});

describe('hasRole', () => {
  const patient = { id: ID, type: 'PATIENT' as const, roles: [] };
  const doctor = { id: ID, type: 'STAFF' as const, roles: ['DOCTOR' as const] };

  it('treats PATIENT as the account type', () => {
    expect(hasRole(patient, 'PATIENT')).toBe(true);
    expect(hasRole(doctor, 'PATIENT')).toBe(false);
  });

  it('matches staff roles', () => {
    expect(hasRole(doctor, 'DOCTOR')).toBe(true);
    expect(hasRole(doctor, 'RECEPTIONIST')).toBe(false);
  });
});
