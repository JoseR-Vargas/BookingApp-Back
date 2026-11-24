import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BrandColors, BrandLogo } from '../../../domain/branding';

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
}

export const BrandingSchema = SchemaFactory.createForClass(BrandingRecord);

BrandingSchema.index({ key: 1 }, { unique: true });
