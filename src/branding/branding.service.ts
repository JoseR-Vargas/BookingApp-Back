import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BrandingInput, LogoInput } from './branding-validation';
import {
  BRANDING_KEY,
  BrandColors,
  BrandLogo,
  BrandingRecord,
  DEFAULT_COLORS,
  LogoMimeType,
} from './schemas/branding.schema';

/** Public view of the branding; the logo is only referenced by URL. */
export interface PublicBranding {
  businessName: string | null;
  colors: BrandColors;
  logoUrl: string | null;
}

export interface StoredLogo {
  mimeType: LogoMimeType;
  data: Buffer;
}

export const LOGO_PATH = '/api/branding/logo';

/**
 * Normalises the stored logo bytes: lean Mongo reads return a BSON `Binary`
 * for a Buffer saved in a Mixed field, test doubles may return a Uint8Array.
 */
export function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  const binary = value as { buffer?: unknown; position?: unknown } | null;
  if (binary && binary.buffer instanceof Uint8Array) {
    const length =
      typeof binary.position === 'number'
        ? binary.position
        : binary.buffer.byteLength;
    return Buffer.from(binary.buffer.buffer, binary.buffer.byteOffset, length);
  }
  throw new TypeError('Unsupported logo data');
}

/**
 * No document: the defaults. A document saved before the button color existed
 * has no `button` key: its buttons used the accent, so they keep following it.
 */
const toColors = (stored: Partial<BrandColors> | undefined): BrandColors => {
  if (!stored) return { ...DEFAULT_COLORS };
  return {
    accent: stored.accent ?? DEFAULT_COLORS.accent,
    background: stored.background ?? DEFAULT_COLORS.background,
    text: stored.text ?? DEFAULT_COLORS.text,
    button: stored.button ?? null,
  };
};

const toPublic = (record: Partial<BrandingRecord> | null): PublicBranding => {
  const logo = record?.logo ?? null;
  return {
    businessName: record?.businessName ?? null,
    colors: toColors(record?.colors),
    logoUrl: logo
      ? `${LOGO_PATH}?v=${new Date(logo.updatedAt).getTime()}`
      : null,
  };
};

/** Reads and writes the single `branding` document. */
@Injectable()
export class BrandingService {
  constructor(
    @InjectModel(BrandingRecord.name)
    private readonly model: Model<BrandingRecord>,
  ) {}

  async getBranding(): Promise<PublicBranding> {
    return toPublic(await this.find());
  }

  async getLogo(): Promise<StoredLogo | null> {
    const logo = (await this.find())?.logo;
    return logo ? { mimeType: logo.mimeType, data: toBuffer(logo.data) } : null;
  }

  /** Replaces name and colors; an existing logo is kept. */
  saveBranding(input: BrandingInput): Promise<PublicBranding> {
    return this.upsert(
      { businessName: input.businessName, colors: input.colors },
      { logo: null },
    );
  }

  saveLogo(input: LogoInput): Promise<PublicBranding> {
    const logo: BrandLogo = {
      mimeType: input.mimeType,
      data: input.data,
      updatedAt: new Date(),
    };
    return this.upsert(
      { logo },
      { businessName: null, colors: { ...DEFAULT_COLORS } },
    );
  }

  deleteLogo(): Promise<PublicBranding> {
    return this.upsert(
      { logo: null },
      { businessName: null, colors: { ...DEFAULT_COLORS } },
    );
  }

  private find(): Promise<BrandingRecord | null> {
    return this.model
      .findOne({ key: BRANDING_KEY })
      .lean<BrandingRecord>()
      .exec();
  }

  /** `$set` the given fields; `onInsert` fills the rest of a new document. */
  private async upsert(
    set: Partial<BrandingRecord>,
    onInsert: Partial<BrandingRecord>,
  ): Promise<PublicBranding> {
    const record = await this.model
      .findOneAndUpdate(
        { key: BRANDING_KEY },
        { $set: set, $setOnInsert: onInsert },
        { upsert: true, new: true },
      )
      .lean<BrandingRecord>()
      .exec();
    return toPublic(record);
  }
}
