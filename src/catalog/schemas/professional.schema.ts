import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** A professional stored in the `professionals` collection. */
@Schema({ collection: 'professionals', versionKey: false })
export class ProfessionalRecord {
  /** Slug generated from the name; unique and immutable. */
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, default: '' })
  specialty: string;

  @Prop({ type: String, default: '' })
  experience: string;

  @Prop({ type: Number, default: 5 })
  rating: number;

  @Prop({ type: String, default: 'fas fa-user' })
  avatar: string;

  @Prop({ type: Boolean, default: true })
  active: boolean;
}

export const ProfessionalSchema =
  SchemaFactory.createForClass(ProfessionalRecord);

ProfessionalSchema.index({ id: 1 }, { unique: true });
