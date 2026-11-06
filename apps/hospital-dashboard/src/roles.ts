import type { StaffRole, User } from './lib/api.ts'

/** The staff roles that have screens on this website, in the order the role switcher shows them. */
export const ROLE_PATHS: Partial<Record<StaffRole, string>> = {
  RECEPTIONIST: '/reception',
}

/** Where a staff member lands after logging in: their first role that has a screen. */
export function homePathFor(user: User): string | null {
  for (const role of user.roles) {
    const path = ROLE_PATHS[role]
    if (path) return path
  }
  return null
}
