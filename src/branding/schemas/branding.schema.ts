import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Key of the single document that holds the business branding. */
export const BRANDING_KEY = 'branding';

export type LogoMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface BrandColors {
  /** '#rrggbb', lowercase. */
  accent: string;
  background: string;
  text: string;
  button: string | null;
}

export interface BrandLogo {
  mimeType: LogoMimeType;
  data: Buffer;
  updatedAt: Date;
}

/** Default colors of the site (Haas light palette: light canvas, red-pink accents, blue buttons), used while no branding is saved. */
export const DEFAULT_COLORS: Readonly<BrandColors> = Object.freeze({
  accent: '#f62039',
  background: '#f9f2f2',
  text: '#111111',
  button: '#295294',
});

/** Singleton document of the `branding` collection. */
@Schema({ collection: 'branding', versionKey: false })
export class BrandingRecord {
  @Prop({ type: String, required: true, default: BRANDING_KEY })
  key: string;

  /** Trimmed, 1 to 60 characters, or null. */
  @Prop({ type: String, default: null })
  businessName: string | null;

  @Prop({ type: Object, required: true })
  colors: BrandColors;

  @Prop({ type: Object, default: null })
  logo: BrandLogo | null;
}

export const BrandingSchema = SchemaFactory.createForClass(BrandingRecord);

BrandingSchema.index({ key: 1 }, { unique: true });
