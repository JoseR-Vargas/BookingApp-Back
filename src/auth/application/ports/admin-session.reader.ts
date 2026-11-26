import { AdminSession } from '../../domain/admin-user';

/** Reads sessions of the business in force. */
export interface AdminSessionReader {
  findByTokenHash(tokenHash: string): Promise<AdminSession | null>;
}

export const ADMIN_SESSION_READER = Symbol('ADMIN_SESSION_READER');
