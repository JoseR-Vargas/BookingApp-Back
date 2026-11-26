// ===== REGLAS DE USUARIOS DE ADMIN =====
// Email, name, password and role rules, and the invariants of the accounts of a
// business. Pure: hashing and time come from ports.

import { Result, err, ok } from '../../shared/domain/result';
import { AdminRole, AdminSession, AdminUser, ADMIN_ROLES } from './admin-user';
import { ADMIN_MESSAGES, InvalidAdminUserError } from './admin-user.errors';

/** A session lasts 7 days. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
const MAX_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const invalid = (message: string): Result<never, InvalidAdminUserError> =>
  err(new InvalidAdminUserError(message));

/** The email as it is stored: trimmed and lowercase. */
export function normalizeEmail(
  value: unknown,
): Result<string, InvalidAdminUserError> {
  if (typeof value !== 'string') return invalid(ADMIN_MESSAGES.invalidEmail);
  const email = value.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(email)) {
    return invalid(ADMIN_MESSAGES.invalidEmail);
  }
  return ok(email);
}

/** The name, trimmed, 1 to 80 characters. */
export function validateName(
  value: unknown,
): Result<string, InvalidAdminUserError> {
  if (typeof value !== 'string') return invalid(ADMIN_MESSAGES.invalidName);
  const name = value.trim();
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    return invalid(ADMIN_MESSAGES.invalidName);
  }
  return ok(name);
}

/** The password exactly as typed: 10 to 128 characters (no trimming). */
export function validatePassword(
  value: unknown,
): Result<string, InvalidAdminUserError> {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    return invalid(ADMIN_MESSAGES.shortPassword);
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return invalid(ADMIN_MESSAGES.longPassword);
  }
  return ok(value);
}

export function validateRole(
  value: unknown,
): Result<AdminRole, InvalidAdminUserError> {
  return ADMIN_ROLES.includes(value as AdminRole)
    ? ok(value as AdminRole)
    : invalid(ADMIN_MESSAGES.invalidRole);
}

/** What the owner types to create an account (untrusted). */
export interface NewAdminUserDraft {
  email: unknown;
  name: unknown;
  password: unknown;
  role: unknown;
}

export interface ValidNewAdminUser {
  email: string;
  name: string;
  password: string;
  role: AdminRole;
}

/** Validates a new account; stops at the first broken rule. */
export function validateNewAdminUser(
  draft: NewAdminUserDraft,
): Result<ValidNewAdminUser, InvalidAdminUserError> {
  const email = normalizeEmail(draft.email);
  if (!email.ok) return email;
  const name = validateName(draft.name);
  if (!name.ok) return name;
  const password = validatePassword(draft.password);
  if (!password.ok) return password;
  const role = validateRole(draft.role);
  if (!role.ok) return role;
  return ok({
    email: email.value,
    name: name.value,
    password: password.value,
    role: role.value,
  });
}

/**
 * Whether applying `changes` to `target` would leave the business without an
 * active owner, given how many active owners it has now.
 */
export function wouldLeaveNoOwner(
  target: Pick<AdminUser, 'role' | 'active'>,
  changes: { role?: AdminRole; active?: boolean },
  activeOwners: number,
): boolean {
  if (target.role !== 'owner' || !target.active) return false;
  const staysOwner = (changes.role ?? target.role) === 'owner';
  const staysActive = changes.active ?? target.active;
  return !(staysOwner && staysActive) && activeOwners <= 1;
}

/** Whether a session has not expired yet. */
export function isSessionLive(
  session: Pick<AdminSession, 'expiresAt'>,
  now: Date,
): boolean {
  return session.expiresAt.getTime() > now.getTime();
}
