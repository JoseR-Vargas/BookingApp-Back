export type LogoMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface BrandColors {
  /** '#rrggbb', lowercase. */
  accent: string;
  background: string;
  text: string;
  /** Null: the buttons follow the accent. */
  button: string | null;
}

export interface BrandLogo {
  mimeType: LogoMimeType;
  data: Buffer;
  updatedAt: Date;
}

/** The business identity shown on the public site. */
export interface Branding {
  /** Trimmed, 1 to 60 characters, or null. */
  businessName: string | null;
  colors: BrandColors;
  logo: BrandLogo | null;
}

/** Name and colors, the part of the branding that is saved together. */
export type BrandingContent = Pick<Branding, 'businessName' | 'colors'>;

/** Default colors of the site (Haas light palette: light canvas, red-pink accents, blue buttons), used while no branding is saved. */
export const DEFAULT_COLORS: Readonly<BrandColors> = Object.freeze({
  accent: '#f62039',
  background: '#f9f2f2',
  text: '#111111',
  button: '#295294',
});

/** What the site shows while nothing has been saved. */
export const defaultBranding = (): Branding => ({
  businessName: null,
  colors: { ...DEFAULT_COLORS },
  logo: null,
});
