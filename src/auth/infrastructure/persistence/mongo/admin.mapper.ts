import { Types } from 'mongoose';
import { AdminSession, AdminUser } from '../../../domain/admin-user';
import { AdminSessionRecord } from './admin-session.entity';
import { AdminUserRecord } from './admin-user.entity';

type WithId<T> = T & { _id: Types.ObjectId };

/** Stored account -> domain model. The password hash is left behind. */
export function toAdminUser(record: WithId<AdminUserRecord>): AdminUser {
  return {
    id: record._id.toHexString(),
    email: record.email,
    name: record.name,
    role: record.role,
    active: record.active,
    createdAt: new Date(record.createdAt),
    lastLoginAt: record.lastLoginAt ? new Date(record.lastLoginAt) : null,
  };
}

/** Stored session -> domain model. */
export function toAdminSession(
  record: WithId<AdminSessionRecord>,
): AdminSession {
  return {
    id: record._id.toHexString(),
    userId: record.userId.toHexString(),
    tokenHash: record.tokenHash,
    expiresAt: new Date(record.expiresAt),
    createdAt: new Date(record.createdAt),
    ...(record.userAgent ? { userAgent: record.userAgent } : {}),
  };
}
