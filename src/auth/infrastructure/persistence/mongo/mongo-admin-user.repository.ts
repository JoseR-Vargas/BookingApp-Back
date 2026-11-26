import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdminUserReader } from '../../../application/ports/admin-user.reader';
import { AdminUserWriter } from '../../../application/ports/admin-user.writer';
import {
  AdminCredentialsRecord,
  AdminUser,
  AdminUserChanges,
  NewAdminUser,
} from '../../../domain/admin-user';
import { AdminUserRecord } from './admin-user.entity';
import { toAdminUser } from './admin.mapper';

type StoredUser = AdminUserRecord & { _id: Types.ObjectId };

const DUPLICATE_KEY = 11000;

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: number }).code === DUPLICATE_KEY;

/** Reads and writes `admin_users` through its Mongoose model (scoped by business). */
@Injectable()
export class MongoAdminUserRepository
  implements AdminUserReader, AdminUserWriter
{
  constructor(
    @InjectModel(AdminUserRecord.name)
    private readonly model: Model<AdminUserRecord>,
  ) {}

  async findById(id: string): Promise<AdminUser | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const record = await this.model
      .findOne({ _id: new Types.ObjectId(id) })
      .lean<StoredUser>()
      .exec();
    return record ? toAdminUser(record) : null;
  }

  async findCredentialsByEmail(
    email: string,
  ): Promise<AdminCredentialsRecord | null> {
    const record = await this.model
      .findOne({ email })
      .lean<StoredUser>()
      .exec();
    return record
      ? { user: toAdminUser(record), passwordHash: record.passwordHash }
      : null;
  }

  async list(): Promise<AdminUser[]> {
    const records = await this.model
      .find()
      .sort({ createdAt: 1, _id: 1 })
      .lean<StoredUser[]>()
      .exec();
    return records.map(toAdminUser);
  }

  countActiveOwners(): Promise<number> {
    return this.model.countDocuments({ role: 'owner', active: true }).exec();
  }

  async create(input: NewAdminUser): Promise<AdminUser | null> {
    try {
      const created = await this.model.create({
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
        role: input.role,
        active: true,
        createdAt: input.createdAt,
        lastLoginAt: null,
      });
      return toAdminUser(created.toObject() as StoredUser);
    } catch (error) {
      if (isDuplicateKey(error)) return null;
      throw error;
    }
  }

  async update(
    id: string,
    changes: AdminUserChanges,
  ): Promise<AdminUser | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const set = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    );
    const record = await this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id) },
        { $set: set },
        { new: true },
      )
      .lean<StoredUser>()
      .exec();
    return record ? toAdminUser(record) : null;
  }
}
