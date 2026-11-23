import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BrandingReader } from '../../../application/ports/branding.reader';
import { BrandingWriter } from '../../../application/ports/branding.writer';
import {
  BrandLogo,
  Branding,
  BrandingContent,
  DEFAULT_COLORS,
} from '../../../domain/branding';
import { BRANDING_KEY, BrandingRecord } from './branding.entity';
import { toBranding, toLogoRecord } from './branding.mapper';

/** Reads and writes the single `branding` document through its Mongoose model. */
@Injectable()
export class MongoBrandingRepository implements BrandingReader, BrandingWriter {
  constructor(
    @InjectModel(BrandingRecord.name)
    private readonly model: Model<BrandingRecord>,
  ) {}

  async find(): Promise<Branding | null> {
    const record = await this.model
      .findOne({ key: BRANDING_KEY })
      .lean<BrandingRecord>()
      .exec();
    return record ? toBranding(record) : null;
  }

  saveBranding(content: BrandingContent): Promise<Branding> {
    return this.upsert(
      { businessName: content.businessName, colors: content.colors },
      { logo: null },
    );
  }

  saveLogo(logo: BrandLogo): Promise<Branding> {
    return this.upsert(
      { logo: toLogoRecord(logo) },
      { businessName: null, colors: { ...DEFAULT_COLORS } },
    );
  }

  deleteLogo(): Promise<Branding> {
    return this.upsert(
      { logo: null },
      { businessName: null, colors: { ...DEFAULT_COLORS } },
    );
  }

  /** `$set` the given fields; `onInsert` fills the rest of a new document. */
  private async upsert(
    set: Partial<BrandingRecord>,
    onInsert: Partial<BrandingRecord>,
  ): Promise<Branding> {
    const record = await this.model
      .findOneAndUpdate(
        { key: BRANDING_KEY },
        { $set: set, $setOnInsert: onInsert },
        { upsert: true, new: true },
      )
      .lean<BrandingRecord>()
      .exec();
    return toBranding(record);
  }
}
