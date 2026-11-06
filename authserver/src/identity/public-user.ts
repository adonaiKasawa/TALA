import type { User } from '../generated/prisma/client.js';
export const publicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  username: u.username,
  phone: u.phone,
  emailVerified: u.emailVerified,
  active: u.active,
  role: u.role,
  mfaEnabled: u.mfaEnabled,
  createdAt: u.createdAt,
});
