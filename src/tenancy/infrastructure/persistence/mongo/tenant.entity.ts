import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongoose';
import { TenantStatus } from '../../../domain/tenant';

/** A business stored in the `tenants` collection. */
@Schema({ collection: 'tenants', versionKey: false })
export class TenantRecord {
  /** The Mongo id; the domain knows it as the `id` of the business. */
  _id: ObjectId;
  /** The unique name of the business in a URL (`X-Tenant`). */
  @Prop({ type: String, required: true })
  slug: string;

  /** The name the business shows. */
  @Prop({ type: String, required: true })
  name: string;

  /** A suspended business does not answer requests. */
  @Prop({ type: String, enum: ['active', 'suspended'], default: 'active' })
  status: TenantStatus;

  /** Exactly one business has it: the one used when the request names none. */
  @Prop({ type: Boolean, default: false })
  isDefault: boolean;

  @Prop({ type: Date, required: true })
  createdAt: Date;
}

export const TenantSchema = SchemaFactory.createForClass(TenantRecord);

TenantSchema.index({ slug: 1 }, { unique: true });

/** There is exactly one default business. */
TenantSchema.index(
  { isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } },
);
