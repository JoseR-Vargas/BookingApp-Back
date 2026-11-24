import { Branding } from '../../domain/branding';

/** Reads the saved branding. */
export interface BrandingReader {
  /** The saved branding, or null when nothing has been saved yet. */
  find(): Promise<Branding | null>;
}

export const BRANDING_READER = Symbol('BRANDING_READER');
