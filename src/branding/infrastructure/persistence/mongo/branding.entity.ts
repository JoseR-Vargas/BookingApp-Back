import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BrandColors, BrandLogo } from '../../../domain/branding';
import { tenantScopePlugin } from '../../../../shared/infrastructure/mongo/tenant-scope.plugin';

/** Key of the single document that holds the business branding. */
export const BRANDING_KEY = 'branding';

/** Singleton document of the `branding` collection. Private to this folder. */
@Schema({ collection: 'branding', versionKey: false })
export class BrandingRecord {
  @Prop({ type: String, required: true, default: BRANDING_KEY })
  key: string;

  /** Trimmed, 1 to 60 characters, or null. */
  @Prop({ type: String, default: null })
  businessName: string | null;

  /** Documents saved before the button color existed have no `button`. */
  @Prop({ type: Object, required: true })
  colors: Partial<BrandColors>;

  @Prop({ type: Object, default: null })
  logo: BrandLogo | null;

  /** The business this document belongs to (spec 18). */
  @Prop({ type: Types.ObjectId, required: false, index: true })
  tenantId?: Types.ObjectId;
}

export const BrandingSchema = SchemaFactory.createForClass(BrandingRecord);

// Every document belongs to a business, and every query is filtered by it (spec 18).
tenantScopePlugin(BrandingSchema);

BrandingSchema.index({ key: 1 }, { unique: true });
