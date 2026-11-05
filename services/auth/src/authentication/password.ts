import { hash, verify } from '@node-rs/argon2';

// argon2id with the library's defaults (19 MiB, 2 passes), as OWASP recommends.

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false; // A malformed hash never matches.
  }
}

/**
 * A real hash to check against when the phone number is unknown, so a wrong
 * number takes as long as a wrong password and doesn't reveal who is registered.
 */
let decoy: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  decoy ??= hash('not-a-real-password');
  await verifyPassword(await decoy, password);
}
