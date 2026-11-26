// ===== USUARIOS Y SESIONES DE ADMIN =====
// The accounts of one business and the sessions they open (spec 20). The
// password hash and the session token never travel in these models: the hash
// has its own type and the token is stored only as a hash.

/** What an admin may do: `owner` everything, `staff` bookings, `viewer` read only. */
export type AdminRole = 'owner' | 'staff' | 'viewer';

export const ADMIN_ROLES: readonly AdminRole[] = ['owner', 'staff', 'viewer'];

/** An admin account, without any secret. */
export interface AdminUser {
  id: string;
  /** Lowercase; unique inside a business. */
  email: string;
  name: string;
  role: AdminRole;
  active: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

/** An account together with its password hash, for the login only. */
export interface AdminCredentialsRecord {
  user: AdminUser;
  passwordHash: string;
}

/** What is needed to store a new account. */
export interface NewAdminUser {
  email: string;
  name: string;
  passwordHash: string;
  role: AdminRole;
  createdAt: Date;
}

/** The fields of an account that may change. */
export interface AdminUserChanges {
  name?: string;
  role?: AdminRole;
  active?: boolean;
  passwordHash?: string;
  lastLoginAt?: Date;
}

/** A session of an account. Only the hash of its token is kept. */
export interface AdminSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  userAgent?: string;
}

/** What is needed to open a session. */
export type NewAdminSession = Omit<AdminSession, 'id'>;
