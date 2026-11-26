import { AdminCredentialsRecord, AdminUser } from '../../domain/admin-user';

/** Reads the accounts of the business in force. */
export interface AdminUserReader {
  findById(id: string): Promise<AdminUser | null>;
  /** The account and its password hash, for the login. `email` is normalized. */
  findCredentialsByEmail(email: string): Promise<AdminCredentialsRecord | null>;
  /** Every account, oldest first. */
  list(): Promise<AdminUser[]>;
  countActiveOwners(): Promise<number>;
}

export const ADMIN_USER_READER = Symbol('ADMIN_USER_READER');
