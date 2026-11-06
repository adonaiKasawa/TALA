import { ForbiddenException } from '@nestjs/common';
import type { Principal } from './auth.metadata.js';
export const roles = [
  'viewer',
  'creator',
  'professional',
  'moderator',
  'admin',
] as const;
export function normalizeRole(role: unknown) {
  return role === 'user'
    ? 'viewer'
    : roles.includes(role as never)
      ? String(role)
      : 'viewer';
}
export function requireRecentMfa(actor: Principal) {
  const now = Date.now() / 1000;
  if (
    !actor.amr?.includes('otp') ||
    !actor.authTime ||
    actor.authTime < now - 300 ||
    actor.authTime > now + 5
  )
    throw new ForbiddenException(
      'Double vérification récente requise. Reconnectez-vous.',
    );
}
export function requireRole(
  actor: Principal,
  allowed: readonly string[],
  sensitive = false,
) {
  const role = normalizeRole(actor.role);
  if (!allowed.includes(role))
    throw new ForbiddenException('Permission insuffisante.');
  if (sensitive || role === 'admin' || role === 'moderator')
    requireRecentMfa(actor);
}
