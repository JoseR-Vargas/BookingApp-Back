import { BrandColors, Branding } from '../../domain/branding';

export const LOGO_PATH = '/api/branding/logo';

/** Public view of the branding; the logo is only referenced by URL. */
export interface PublicBranding {
  businessName: string | null;
  colors: BrandColors;
  logoUrl: string | null;
}

/** Domain branding -> API answer. `?v=` changes with every new logo, so caches never serve a stale one. */
export function toPublicBranding(branding: Branding): PublicBranding {
  return {
    businessName: branding.businessName,
    colors: branding.colors,
    logoUrl: branding.logo
      ? `${LOGO_PATH}?v=${branding.logo.updatedAt.getTime()}`
      : null,
  };
}
