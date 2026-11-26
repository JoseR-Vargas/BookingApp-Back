import { AdminSession, NewAdminSession } from '../../domain/admin-user';

/** Writes sessions of the business in force. */
export interface AdminSessionWriter {
  create(session: NewAdminSession): Promise<AdminSession>;
  /** Revokes one session; nothing happens when it does not exist. */
  revokeByTokenHash(tokenHash: string): Promise<void>;
  /** Revokes every session of an account. */
  revokeAllOfUser(userId: string): Promise<void>;
}

export const ADMIN_SESSION_WRITER = Symbol('ADMIN_SESSION_WRITER');
