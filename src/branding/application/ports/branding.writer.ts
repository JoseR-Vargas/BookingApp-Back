import { BrandLogo, Branding, BrandingContent } from '../../domain/branding';

/**
 * Writes the single branding. Every operation creates it when missing and
 * answers the branding as saved. A new branding starts from the defaults for
 * the part the operation does not set, and without logo.
 */
export interface BrandingWriter {
  /** Replaces name and colors; an existing logo is kept. */
  saveBranding(content: BrandingContent): Promise<Branding>;
  /** Replaces the logo; name and colors are kept. */
  saveLogo(logo: BrandLogo): Promise<Branding>;
  /** Removes the logo; name and colors are kept. */
  deleteLogo(): Promise<Branding>;
}

export const BRANDING_WRITER = Symbol('BRANDING_WRITER');
