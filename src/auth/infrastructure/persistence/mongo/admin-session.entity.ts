import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { tenantScopePlugin } from '../../../../shared/infrastructure/mongo/tenant-scope.plugin';

/** A session of an admin account. Private to this folder. */
@Schema({ collection: 'admin_sessions', versionKey: false })
export class AdminSessionRecord {
  /** The business this session belongs to (spec 18). */
  @Prop({ type: Types.ObjectId, required: false, index: true })
  tenantId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  /** SHA-256 of the token. The plain token is never stored. */
  @Prop({ type: String, required: true })
  tokenHash: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date, required: true })
  createdAt: Date;

  @Prop({ type: String, required: false })
  userAgent?: string;
}

export const AdminSessionSchema =
  SchemaFactory.createForClass(AdminSessionRecord);

tenantScopePlugin(AdminSessionSchema);

// The lookup runs inside the business of the request, so a token of another
// business never matches.
AdminSessionSchema.index({ tenantId: 1, tokenHash: 1 }, { unique: true });
AdminSessionSchema.index({ tenantId: 1, userId: 1 });
// TTL: MongoDB deletes the session when `expiresAt` passes (no cron). A TTL
// index cannot be compound, so it is the one index without `tenantId`.
AdminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
