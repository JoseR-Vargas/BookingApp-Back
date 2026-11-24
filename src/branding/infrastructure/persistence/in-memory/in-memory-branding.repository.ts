import { BrandingReader } from '../../../application/ports/branding.reader';
import { BrandingWriter } from '../../../application/ports/branding.writer';
import {
  BrandLogo,
  Branding,
  BrandingContent,
  defaultBranding,
} from '../../../domain/branding';

const copy = (branding: Branding): Branding => ({
  businessName: branding.businessName,
  colors: { ...branding.colors },
  logo: branding.logo
    ? {
        mimeType: branding.logo.mimeType,
        data: Buffer.from(branding.logo.data),
        updatedAt: new Date(branding.logo.updatedAt),
      }
    : null,
});

/**
 * Keeps the single branding in memory. It honors the same port contract as
 * the MongoDB adapter; use-case and HTTP tests run on it.
 */
export class InMemoryBrandingRepository
  implements BrandingReader, BrandingWriter
{
  private stored: Branding | null = null;

  /** The stored brandings (none or one), for assertions on what was kept. */
  get docs(): readonly Branding[] {
    return this.stored ? [copy(this.stored)] : [];
  }

  /** Puts a branding in the store as it is, bypassing the port. */
  seed(branding: Branding): void {
    this.stored = copy(branding);
  }

  find(): Promise<Branding | null> {
    return Promise.resolve(this.stored ? copy(this.stored) : null);
  }

  saveBranding(content: BrandingContent): Promise<Branding> {
    return Promise.resolve(
      this.update((current) => ({
        ...current,
        businessName: content.businessName,
        colors: { ...content.colors },
      })),
    );
  }

  saveLogo(logo: BrandLogo): Promise<Branding> {
    return Promise.resolve(this.update((current) => ({ ...current, logo })));
  }

  deleteLogo(): Promise<Branding> {
    return Promise.resolve(
      this.update((current) => ({ ...current, logo: null })),
    );
  }

  /** Applies `change` to the stored branding (the defaults when missing). */
  private update(change: (current: Branding) => Branding): Branding {
    this.stored = copy(change(this.stored ?? defaultBranding()));
    return copy(this.stored);
  }
}
