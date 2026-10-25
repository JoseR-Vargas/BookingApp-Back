import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Meta retries deliveries for a few days at most; 48h covers the dedupe need. */
export const PROCESSED_MESSAGE_TTL_SECONDS = 48 * 60 * 60;

/** Marker of an inbound WhatsApp message that was already handled. */
@Schema()
export class ProcessedMessage extends Document {
  @Prop({ required: true, unique: true })
  messageId: string;

  @Prop({
    type: Date,
    default: Date.now,
    expires: PROCESSED_MESSAGE_TTL_SECONDS,
  })
  createdAt: Date;
}

export const ProcessedMessageSchema =
  SchemaFactory.createForClass(ProcessedMessage);
