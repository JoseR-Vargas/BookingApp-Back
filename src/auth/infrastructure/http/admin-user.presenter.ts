import { AdminUser } from '../../domain/admin-user';

/** What the API shows of an account: never a hash, never a token. */
export interface PublicAdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminUser['role'];
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export const toPublicAdminUser = (user: AdminUser): PublicAdminUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  active: user.active,
  createdAt: user.createdAt.toISOString(),
  lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
});
