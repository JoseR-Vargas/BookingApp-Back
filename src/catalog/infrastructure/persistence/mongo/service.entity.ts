import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** A bookable service stored in the `services` collection. */
@Schema({ collection: 'services', versionKey: false })
export class ServiceRecord {
  /** Slug generated from the name; unique and immutable. */
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, default: '' })
  description: string;

  /** Integer >= 0. */
  @Prop({ type: Number, required: true })
  price: number;

  /** Minutes, integer between 5 and 480. */
  @Prop({ type: Number, required: true })
  duration: number;

  /** Ids of the professionals that offer this service. */
  @Prop({ type: [String], default: [] })
  professionals: string[];

  @Prop({ type: String, default: 'fas fa-star' })
  icon: string;

  @Prop({ type: Boolean, default: true })
  active: boolean;
}

export const ServiceSchema = SchemaFactory.createForClass(ServiceRecord);

ServiceSchema.index({ id: 1 }, { unique: true });
