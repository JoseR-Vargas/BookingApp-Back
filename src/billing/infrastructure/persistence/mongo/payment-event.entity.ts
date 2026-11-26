import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * An event the payment gateway sent (spec 23). Private to this folder.
 *
 * EXCEPTION to tenant scoping: this collection is GLOBAL (no `tenantId`, no
 * `tenantScopePlugin`). The public webhook must know whether it already saw an
 * event BEFORE it knows the business, and an event id is unique at the
 * gateway across every business. It is not in SCOPED_COLLECTIONS.
 */
@Schema({ collection: 'payment_events', versionKey: false })
export class PaymentEventRecord {
  @Prop({ type: String, required: true })
  externalEventId: string;

  @Prop({ type: String, required: true })
  type: string;

  @Prop({ type: Date, required: true })
  processedAt: Date;
}

export const PaymentEventSchema =
  SchemaFactory.createForClass(PaymentEventRecord);

PaymentEventSchema.index({ externalEventId: 1 }, { unique: true });
