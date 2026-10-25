import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

/** An idle conversation is forgotten after 24h (the WhatsApp service window). */
export const CONVERSATION_STATE_TTL_SECONDS = 24 * 60 * 60;

/** Where a WhatsApp user is in the bot flow. Steps and data are defined by the bot. */
@Schema()
export class ConversationState extends Document {
  @Prop({ required: true, unique: true })
  phone: string;

  @Prop({ required: true })
  step: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  data: Record<string, unknown>;

  /** Refreshed on every save; drives the TTL index. */
  @Prop({
    type: Date,
    default: Date.now,
    expires: CONVERSATION_STATE_TTL_SECONDS,
  })
  updatedAt: Date;
}

export const ConversationStateSchema =
  SchemaFactory.createForClass(ConversationState);
