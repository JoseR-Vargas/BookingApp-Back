import { toBuffer } from '../../../../shared/infrastructure/mongo/to-buffer';
import { BrandLogo, Branding } from '../../../domain/branding';
import { completeColors } from '../../../domain/branding.rules';
import { BrandingRecord } from './branding.entity';

/** Stored document -> domain model. Missing parts take the domain defaults. */
export function toBranding(record: Partial<BrandingRecord>): Branding {
  return {
    businessName: record.businessName ?? null,
    colors: completeColors(record.colors),
    logo: record.logo
      ? {
          mimeType: record.logo.mimeType,
          data: toBuffer(record.logo.data),
          updatedAt: new Date(record.logo.updatedAt),
        }
      : null,
  };
}

/** Domain logo -> the shape stored in the document. */
export function toLogoRecord(logo: BrandLogo): BrandLogo {
  return {
    mimeType: logo.mimeType,
    data: logo.data,
    updatedAt: logo.updatedAt,
  };
}
