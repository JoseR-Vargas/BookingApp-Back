import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdminSessionReader } from '../../../application/ports/admin-session.reader';
import { AdminSessionWriter } from '../../../application/ports/admin-session.writer';
import { AdminSession, NewAdminSession } from '../../../domain/admin-user';
import { AdminSessionRecord } from './admin-session.entity';
import { toAdminSession } from './admin.mapper';

type StoredSession = AdminSessionRecord & { _id: Types.ObjectId };

/** Reads and writes `admin_sessions` (scoped by business, TTL on `expiresAt`). */
@Injectable()
export class MongoAdminSessionRepository
  implements AdminSessionReader, AdminSessionWriter
{
  constructor(
    @InjectModel(AdminSessionRecord.name)
    private readonly model: Model<AdminSessionRecord>,
  ) {}

  async findByTokenHash(tokenHash: string): Promise<AdminSession | null> {
    const record = await this.model
      .findOne({ tokenHash })
      .lean<StoredSession>()
      .exec();
    return record ? toAdminSession(record) : null;
  }

  async create(input: NewAdminSession): Promise<AdminSession> {
    const created = await this.model.create({
      userId: new Types.ObjectId(input.userId),
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: input.createdAt,
      userAgent: input.userAgent,
    });
    return toAdminSession(created.toObject() as StoredSession);
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.model.deleteOne({ tokenHash }).exec();
  }

  async revokeAllOfUser(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) return;
    await this.model.deleteMany({ userId: new Types.ObjectId(userId) }).exec();
  }
}
