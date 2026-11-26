import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { tenantScopePlugin } from '../../../../shared/infrastructure/mongo/tenant-scope.plugin';
import { AdminRole } from '../../../domain/admin-user';

/** An admin account of a business. Private to this folder. */
@Schema({ collection: 'admin_users', versionKey: false })
export class AdminUserRecord {
  /** The business this account belongs to (spec 18). */
  @Prop({ type: Types.ObjectId, required: false, index: true })
  tenantId?: Types.ObjectId;

  /** Lowercase; unique inside a business. */
  @Prop({ type: String, required: true })
  email: string;

  @Prop({ type: String, required: true })
  name: string;

  /** Never leaves the backend. */
  @Prop({ type: String, required: true })
  passwordHash: string;

  @Prop({ type: String, required: true, enum: ['owner', 'staff', 'viewer'] })
  role: AdminRole;

  @Prop({ type: Boolean, required: true, default: true })
  active: boolean;

  @Prop({ type: Date, required: true })
  createdAt: Date;

  @Prop({ type: Date, default: null })
  lastLoginAt: Date | null;
}

export const AdminUserSchema = SchemaFactory.createForClass(AdminUserRecord);

// Every account belongs to a business, and every query is filtered by it (spec 18).
tenantScopePlugin(AdminUserSchema);

AdminUserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
AdminUserSchema.index({ tenantId: 1, role: 1 });
