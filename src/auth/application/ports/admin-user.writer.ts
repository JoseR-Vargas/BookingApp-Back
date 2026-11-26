import {
  AdminUser,
  AdminUserChanges,
  NewAdminUser,
} from '../../domain/admin-user';

/** Writes the accounts of the business in force. */
export interface AdminUserWriter {
  /** Stores the account; answers null when the email is already taken. */
  create(user: NewAdminUser): Promise<AdminUser | null>;
  /** Applies the changes; answers null when the account does not exist. */
  update(id: string, changes: AdminUserChanges): Promise<AdminUser | null>;
}

export const ADMIN_USER_WRITER = Symbol('ADMIN_USER_WRITER');
