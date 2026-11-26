import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { tenantScopePlugin } from '../../../../shared/infrastructure/mongo/tenant-scope.plugin';
import { PLAN_IDS, PlanId } from '../../../domain/plans';
import {
  SUBSCRIPTION_STATUSES,
  SubscriptionStatus,
} from '../../../domain/subscription';

/** The subscription of a business (spec 23). Private to this folder. */
@Schema({ collection: 'subscriptions', versionKey: false })
export class SubscriptionRecord {
  /** The business this subscription belongs to: one per business. */
  @Prop({ type: Types.ObjectId, required: false })
  tenantId?: Types.ObjectId;

  @Prop({ type: String, enum: PLAN_IDS, required: true })
  planId: PlanId;

  @Prop({ type: String, enum: SUBSCRIPTION_STATUSES, required: true })
  status: SubscriptionStatus;

  @Prop({ type: Date, required: true })
  currentPeriodEnd: Date;

  @Prop({ type: Boolean, required: true, default: false })
  cancelAtPeriodEnd: boolean;

  @Prop({ type: String, required: false, default: null })
  externalPaymentId: string | null;

  @Prop({ type: Date, required: true })
  createdAt: Date;

  @Prop({ type: Date, required: true })
  updatedAt: Date;
}

export const SubscriptionSchema =
  SchemaFactory.createForClass(SubscriptionRecord);

tenantScopePlugin(SubscriptionSchema);

// One subscription per business, and tenant-first like every scoped index.
SubscriptionSchema.index({ tenantId: 1 }, { unique: true });
SubscriptionSchema.index({ tenantId: 1, status: 1 });
