import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { tenantScopePlugin } from '../../../../shared/infrastructure/mongo/tenant-scope.plugin';

export interface ProfessionalPhoto {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  data: Buffer;
  updatedAt: Date;
}

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

  /**
   * Profile picture. Queries exclude `photo.data` (`-photo.data`); only the
   * photo endpoint reads the bytes. Missing field = no photo.
   */
  @Prop({ type: Object, default: null })
  photo: ProfessionalPhoto | null;

  /**
   * Ids of the locations the professional works at. Absent (documents stored
   * before locations existed) = the default location. `default: undefined`
   * keeps Mongoose from inserting an empty array on upsert.
   */
  @Prop({ type: [String], default: undefined })
  locationIds?: string[];

  /** The business this document belongs to (spec 18). */
  @Prop({ type: Types.ObjectId, required: false, index: true })
  tenantId?: Types.ObjectId;
}

export const ProfessionalSchema =
  SchemaFactory.createForClass(ProfessionalRecord);

// Every document belongs to a business, and every query is filtered by it (spec 18).
tenantScopePlugin(ProfessionalSchema);

ProfessionalSchema.index({ tenantId: 1, id: 1 }, { unique: true });
